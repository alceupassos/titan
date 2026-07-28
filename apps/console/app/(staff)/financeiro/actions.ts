"use server";

// Fluxo de Contas a Pagar — AP (Fase 5, Passo 4a — docs/fase-atual.md; seção 9.5 do prompt único).
// Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza (CASL) dentro dela
// mesma" — as duas ações abaixo fazem as duas coisas por conta própria, sem confiar em nenhuma
// checagem anterior (nem no `proxy.ts`, que só confere presença de cookie — ver
// apps/console/lib/auth/session.ts). Mesmo estilo de
// apps/console/app/(staff)/reservas/nova/actions.ts e apps/console/app/(staff)/aprovacoes/actions.ts.
//
// IMPORTANTE: estas são Server Actions REAIS, contra o banco via `withTenant` — ao contrário da UI
// da page (./page.tsx, ./AccountsPayableList.tsx), que renderiza dados de AMOSTRA estática
// (./sample-data.ts) por não haver Postgres vivo nesta máquina (Gap conhecido 2 —
// docs/fase-atual.md). Chamar estas ações a partir da amostra tenta o Postgres real e, sem Docker
// rodando, falha com erro de conexão — esperado nesta fase, não um bug desta Server Action.
//
// DECISÃO (submitAccountsPayableAction): abre a `approval_requests` (tipo "purchase_order", fila
// já existente desde a Fase 2 — apps/console/app/(staff)/aprovacoes) na MESMA transação que cria a
// linha de `accounts_payable`, vinculando `accounts_payable.approval_request_id` ao id recém-criado.
// Nenhum fluxo de aprovação paralelo é inventado aqui — a decisão em si (aprovar/rejeitar) continua
// acontecendo exclusivamente pela fila real (`decideApprovalAction`, ./aprovacoes/actions.ts, fora
// do escopo desta faixa), nunca por um botão específico desta tela (anti-padrão #15).
//
// DECISÃO (payAccountsPayableAction): a tabela `accounts_payable` não tem uma Server Action própria
// de "marcar como aprovada" — em vez de reusar `decideApprovalAction` (edição fora do escopo desta
// faixa) ou duplicar a fila de decisão, `payAccountsPayableAction` LÊ o status atual da
// `approval_requests` vinculada no momento do pagamento: só prossegue se já estiver "approved"
// (decidida pela fila real em /aprovacoes). Nesse caso, a transição
// `pending -> approved -> paid` de `accounts_payable.status` acontece de uma vez só, dentro desta
// mesma ação, junto com o posting do lançamento no ledger — não existe um botão "aprovar despesa"
// separado nesta tela porque a decisão de aprovação REAL já foi tomada alhures; esta ação só
// materializa a consequência financeira (I2/I3: pagamento é lançamento imutável, nunca decidido
// silenciosamente por uma automação sem a aprovação humana registrada antes — anti-padrão #14).
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { SubmitAccountsPayableSchema } from "@titan/contracts";
import { postDoubleEntry, type Cents, type LedgerLine } from "@titan/domain";
import type { CurrencyCode } from "@titan/money";
import { accounts, accountsPayable, approvalRequests, ledgerEntries, units, vendors, withTenant, type TenantDb } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const PayAccountsPayableSchema = z.object({
  accountsPayableId: z.string().uuid(),
});

// SLA de 48h para decisão — mesma janela já usada para o tipo "purchase_order" na amostra da fila
// central (apps/console/app/(staff)/aprovacoes/sample-data.ts), não um valor inventado aqui.
const PURCHASE_ORDER_SLA_MS = 48 * 60 * 60 * 1000;

// Faixas de risco por valor (seção 9.4.1 do prompt único, aplicada aqui conforme especificado no
// prompt desta faixa): ≤ R$300 baixo, até R$3.000 médio, acima disso alto. Documentado em código,
// nunca em constante mágica sem explicação — mesma exigência de docs/anti-padroes.md #6 (que trata
// de alíquota/prazo, aqui aplicada por analogia a alçada de risco).
function riskForAmount(amountCents: Cents): "low" | "medium" | "high" {
  if (amountCents <= 30_000) return "low";
  if (amountCents <= 300_000) return "medium";
  return "high";
}

function asCurrencyCode(value: string): CurrencyCode {
  if (value === "BRL" || value === "USD" || value === "EUR") {
    return value;
  }
  throw new Error(`Moeda desconhecida na conta a pagar: "${value}".`);
}

/** Mesmo shape de código de conta usado por `apps/worker/src/payment-repo.ts` (`findOrCreateAccount`)
 * — reimplementado aqui inline porque este pacote (`apps/console`) não depende de `apps/worker`, e o
 * prompt desta faixa autoriza construir a posting rule inline sem editar `packages/domain`. Reusa
 * literalmente o código "cash" do worker (mesma conta de caixa real da operação), não uma conta de
 * caixa paralela. */
async function findOrCreateAccount(
  db: TenantDb,
  tenantId: string,
  code: string,
  name: string,
  kind: "asset" | "liability" | "equity" | "revenue" | "expense",
): Promise<string> {
  const [existing] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.tenantId, tenantId), eq(accounts.code, code)));
  if (existing) {
    return existing.id;
  }

  const [created] = await db.insert(accounts).values({ tenantId, code, name, kind }).returning({ id: accounts.id });
  if (!created) {
    throw new Error(`Falha ao criar conta "${code}" — INSERT não retornou id.`);
  }
  return created.id;
}

/** Código de conta de despesa derivado da categoria do fornecedor (ex.: "lavanderia" ->
 * "expense_vendor_lavanderia") — sanitizado para minúsculas/underscore porque `category` é texto
 * livre no cadastro de fornecedor (packages/db/src/schema/vendor.ts). */
function expenseAccountCodeForCategory(category: string): string {
  const slug = category
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `expense_vendor_${slug || "geral"}`;
}

function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

type SubmitOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "created"; accountsPayableId: string; approvalRequestId: string };

export async function submitAccountsPayableAction(
  input: unknown,
): Promise<ActionResult<{ accountsPayableId: string; approvalRequestId: string }>> {
  const parsed = SubmitAccountsPayableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("create", "accounts_payable")) {
    return { ok: false, error: "Sem permissão para submeter contas a pagar com o papel atual." };
  }

  try {
    const outcome = await withTenant<SubmitOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [vendorRow] = await db
          .select({ id: vendors.id })
          .from(vendors)
          .where(and(eq(vendors.id, request.vendorId), eq(vendors.tenantId, session.tenantId)));
        if (!vendorRow) {
          return { kind: "business-error", error: "Fornecedor não encontrado." };
        }

        if (request.unitId) {
          const [unitRow] = await db
            .select({ id: units.id })
            .from(units)
            .where(and(eq(units.id, request.unitId), eq(units.tenantId, session.tenantId)));
          if (!unitRow) {
            return { kind: "business-error", error: "Unidade não encontrada." };
          }
        }

        const risk = riskForAmount(request.amountCents);
        const slaAt = new Date(Date.now() + PURCHASE_ORDER_SLA_MS);

        const [approvalRow] = await db
          .insert(approvalRequests)
          .values({
            tenantId: session.tenantId,
            type: "purchase_order",
            requestedBy: session.userId,
            rationale: request.description,
            impact: {
              amountCents: request.amountCents,
              affectedEntities: [request.unitId ? `unit:${request.unitId}` : `vendor:${request.vendorId}`],
            },
            risk,
            requiredApprovals: 1,
            stepUpRequired: false,
            slaAt,
          })
          .returning({ id: approvalRequests.id });
        if (!approvalRow) {
          throw new Error("INSERT de solicitação de aprovação não retornou id.");
        }

        const [apRow] = await db
          .insert(accountsPayable)
          .values({
            tenantId: session.tenantId,
            vendorId: request.vendorId,
            unitId: request.unitId ?? null,
            description: request.description,
            amountCents: request.amountCents,
            currency: request.currency,
            status: "pending",
            dueDate: request.dueDateISO,
            approvalRequestId: approvalRow.id,
          })
          .returning({ id: accountsPayable.id });
        if (!apRow) {
          throw new Error("INSERT de conta a pagar não retornou id.");
        }

        return { kind: "created", accountsPayableId: apRow.id, approvalRequestId: approvalRow.id };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { accountsPayableId: outcome.accountsPayableId, approvalRequestId: outcome.approvalRequestId } };
  } catch (err) {
    return toActionError(err, "Falha ao submeter conta a pagar.");
  }
}

type PayOutcome = { kind: "business-error"; error: string } | { kind: "paid" };

export async function payAccountsPayableAction(input: unknown): Promise<ActionResult<{ status: "paid" }>> {
  const parsed = PayAccountsPayableSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const { accountsPayableId } = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("approve", "accounts_payable")) {
    return { ok: false, error: "Sem permissão para pagar contas a pagar com o papel atual." };
  }

  try {
    const outcome = await withTenant<PayOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [apRow] = await db
          .select()
          .from(accountsPayable)
          .where(and(eq(accountsPayable.id, accountsPayableId), eq(accountsPayable.tenantId, session.tenantId)));
        if (!apRow) {
          return { kind: "business-error", error: "Conta a pagar não encontrada." };
        }
        if (apRow.status === "paid") {
          return { kind: "business-error", error: "Esta conta a pagar já foi paga." };
        }
        if (!apRow.approvalRequestId) {
          // Não deveria acontecer — submitAccountsPayableAction sempre vincula um approval_request.
          // Erro claro em vez de prosseguir "mesmo assim" sem controle interno (anti-padrão #15).
          return { kind: "business-error", error: "Conta a pagar sem solicitação de aprovação vinculada." };
        }

        const [approvalRow] = await db
          .select({ status: approvalRequests.status })
          .from(approvalRequests)
          .where(eq(approvalRequests.id, apRow.approvalRequestId));
        if (!approvalRow) {
          return { kind: "business-error", error: "Solicitação de aprovação vinculada não encontrada." };
        }
        if (approvalRow.status === "pending") {
          return {
            kind: "business-error",
            error: "Aguardando decisão na fila de Aprovações (/aprovacoes) antes de poder pagar.",
          };
        }
        if (approvalRow.status !== "approved") {
          return {
            kind: "business-error",
            error: `Solicitação de aprovação em estado "${approvalRow.status}" — pagamento não permitido.`,
          };
        }

        const [vendorRow] = await db
          .select({ category: vendors.category })
          .from(vendors)
          .where(eq(vendors.id, apRow.vendorId));
        if (!vendorRow) {
          return { kind: "business-error", error: "Fornecedor da conta a pagar não encontrado." };
        }

        const currency = asCurrencyCode(apRow.currency);
        const cashAccountId = await findOrCreateAccount(db, session.tenantId, "cash", "Caixa", "asset");
        const expenseAccountId = await findOrCreateAccount(
          db,
          session.tenantId,
          expenseAccountCodeForCategory(vendorRow.category),
          `Despesa - ${vendorRow.category}`,
          "expense",
        );

        // Posting rule inline (débito despesa, crédito caixa) — não existe uma função pronta em
        // `packages/domain/src/ledger/posting-rules.ts` para "despesa de fornecedor paga", e o
        // prompt desta faixa autoriza construir isto direto com `postDoubleEntry`/`LedgerLine[]`
        // sem editar `packages/domain`. Fecha por construção: as duas linhas têm o MESMO valor —
        // `postDoubleEntry` é quem prova isso (lança `UnbalancedEntryError` se não fechar).
        const lines: LedgerLine[] = [
          { accountId: expenseAccountId, direction: "debit", amountCents: apRow.amountCents, currency },
          { accountId: cashAccountId, direction: "credit", amountCents: apRow.amountCents, currency },
        ];
        const entries = postDoubleEntry({
          tenantId: session.tenantId,
          lines,
          createdAtEpochMs: Date.now(),
          idGenerator: randomUUID,
        });

        await db.insert(ledgerEntries).values(
          entries.map((entry) => ({
            id: entry.id,
            tenantId: entry.tenantId,
            accountId: entry.accountId,
            direction: entry.direction,
            amountCents: entry.amountCents,
            currency: entry.currency,
            reversalOfId: entry.reversalOfId,
            createdAt: new Date(entry.createdAt),
          })),
        );

        // Transição pending -> approved -> paid de uma vez só — ver decisão documentada no
        // cabeçalho do arquivo sobre por que não existe um passo "approved" separado nesta tela.
        await db.update(accountsPayable).set({ status: "paid" }).where(eq(accountsPayable.id, apRow.id));

        return { kind: "paid" };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: "paid" } };
  } catch (err) {
    return toActionError(err, "Falha ao pagar conta a pagar.");
  }
}
