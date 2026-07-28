"use server";

// Server Actions do cadastro/pagamento de prestador (Fase 7, Passo 4b — docs/fase-atual.md;
// seção 9.10.3-9.10.4 do prompt único). Regra dura do CLAUDE.md raiz: "Toda Server Action valida
// (Zod) e autoriza (CASL) dentro dela mesma" — as três ações abaixo fazem as duas coisas por
// conta própria, sem confiar em nenhuma checagem anterior (nem no `proxy.ts`, que só confere
// presença de cookie — ver apps/console/lib/auth/session.ts). Mesmo estilo de
// apps/console/app/(staff)/financeiro/actions.ts e apps/console/app/(staff)/repasses/actions.ts —
// leia os dois antes de mexer aqui.
//
// Escopo desta faixa: SÓ apps/console/app/(staff)/prestadores/*. As faixas paralelas desta mesma
// sessão mexem em apps/console/app/(vendor)/portal-prestador/* e apps/console/app/(staff)/estoque/*
// — não tocadas aqui.
//
// IMPORTANTE: estas são Server Actions REAIS, contra o banco via `withTenant` — ao contrário da
// UI da page (./page.tsx, ./[id]/page.tsx), que renderiza dados de AMOSTRA estática
// (./sample-data.ts) por não haver Postgres vivo nesta máquina (Gap conhecido 2 —
// docs/fase-atual.md). Chamar estas ações a partir da amostra tenta o Postgres real e, sem Docker
// rodando, falha com erro de conexão — esperado nesta fase, não um bug desta Server Action.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  PayVendorInvoiceSchema,
  RateVendorAfterWorkOrderSchema,
  UpdateVendorProfileSchema,
} from "@titan/contracts";
import {
  calculateVendorRetentionAmountsCents,
  canTransitionWorkOrder,
  entriesForVendorPayment,
  NoVendorRetentionRuleForRegimeError,
  OverlappingVendorRetentionRuleValidityError,
  postDoubleEntry,
  resolveVendorRetentionRuleForDate,
  type VendorRetentionAmounts,
  type VendorRetentionRule,
  type VendorTaxRegime,
  type WorkOrderStatus,
} from "@titan/domain";
import { civilDate } from "@titan/dates";
import type { CurrencyCode } from "@titan/money";
import {
  accounts,
  accountsPayable,
  ledgerEntries,
  vendorRetentionRules,
  vendors,
  workOrders,
  withTenant,
  type TenantDb,
} from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

function asCurrencyCode(value: string): CurrencyCode {
  if (value === "BRL" || value === "USD" || value === "EUR") {
    return value;
  }
  throw new Error(`Moeda desconhecida na conta a pagar do prestador: "${value}".`);
}

/** Mesmo shape/padrão de apps/console/app/(staff)/financeiro/actions.ts::findOrCreateAccount —
 * reimplementado aqui inline porque este pacote (`apps/console`) não depende de outro arquivo de
 * rota, e o prompt desta faixa autoriza construir a posting rule inline sem editar
 * `packages/domain`. Reusa literalmente o código "cash" já usado pelas outras rotas do cockpit
 * (mesma conta de caixa real da operação), não uma conta de caixa paralela. */
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

/** Idêntica a apps/console/app/(staff)/financeiro/actions.ts::expenseAccountCodeForCategory —
 * mesmo código de conta de despesa por categoria de fornecedor, reimplementado aqui pelo mesmo
 * motivo de `findOrCreateAccount` acima (este arquivo não importa de outro arquivo de rota). */
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

function isVendorTaxRegime(value: string): value is VendorTaxRegime {
  return value === "pj_cessao_mao_obra" || value === "pj_simples" || value === "pf_autonomo";
}

function toDomainRetentionRule(row: typeof vendorRetentionRules.$inferSelect): VendorRetentionRule {
  if (!isVendorTaxRegime(row.taxRegime)) {
    throw new Error(`vendor_retention_rules com tax_regime desconhecido no banco: "${row.taxRegime}".`);
  }
  return {
    id: row.id,
    tenantId: row.tenantId,
    taxRegime: row.taxRegime,
    inssBasisPoints: row.inssBasisPoints,
    irrfBasisPoints: row.irrfBasisPoints,
    csrfBasisPoints: row.csrfBasisPoints,
    issBasisPoints: row.issBasisPoints,
    validFrom: civilDate(row.validFrom),
    validTo: civilDate(row.validTo),
  };
}

type UpdateProfileOutcome = { kind: "business-error"; error: string } | { kind: "updated" };

/**
 * Atualiza regime de tributação + status de compliance do prestador — cadastro manual nesta
 * fase (sem integração real com Receita/Caixa/FGTS, ver docs/fase-atual.md). Nunca aplica um
 * regime default silenciosamente: o campo só muda para o valor explícito informado no formulário.
 */
export async function updateVendorProfileAction(input: unknown): Promise<ActionResult<{ vendorId: string }>> {
  const parsed = UpdateVendorProfileSchema.safeParse(input);
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

  if (session.ability.cannot("update", "vendor_profile")) {
    return { ok: false, error: "Sem permissão para atualizar cadastro de prestador com o papel atual." };
  }

  try {
    const outcome = await withTenant<UpdateProfileOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [vendorRow] = await db
          .select({ id: vendors.id })
          .from(vendors)
          .where(and(eq(vendors.id, request.vendorId), eq(vendors.tenantId, session.tenantId)));
        if (!vendorRow) {
          return { kind: "business-error", error: "Prestador não encontrado." };
        }

        await db
          .update(vendors)
          .set({ taxRegime: request.taxRegime, complianceStatus: request.complianceStatus })
          .where(eq(vendors.id, request.vendorId));

        return { kind: "updated" };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { vendorId: request.vendorId } };
  } catch (err) {
    return toActionError(err, "Falha ao atualizar cadastro de prestador.");
  }
}

type RateOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "rated"; ratingAvgBasisPoints: number; ratingCount: number };

/**
 * Avalia o prestador ao concluir uma OS (seção 9.10.4) — nota 0-5, alimentando a média agregada
 * de `vendors` (`ratingAvgBasisPoints`/`ratingCount`).
 *
 * DECISÃO DE ESCOPO (documentada, exigida pelo prompt desta faixa): não existe, nesta fase, uma
 * tabela de "avaliações individuais" — só a coluna agregada `ratingAvgBasisPoints` em `vendors`
 * (Fase 7, migration 0008) mais `ratingCount` (Fase 7, migration 0009, adicionada nesta faixa —
 * ver comentário de cabeçalho de packages/db/migrations/0009_vendor_rating_count.sql). A média é
 * recalculada de forma INCREMENTAL, sem reconstruir nenhum array de notas:
 *
 *   newAvgBasisPoints = round((currentAvgBasisPoints * ratingCount + rating*100) / (ratingCount+1))
 *
 * Isto é matematicamente equivalente a chamar `computeVendorScoreAverage`
 * (packages/domain/src/vendor/compliance.ts) sobre o histórico COMPLETO de notas — a média
 * aritmética simples de N valores é igual a `(média de N-1 valores * (N-1) + valor N-ésimo) / N`
 * — sem precisar armazenar cada nota individual numa tabela própria. Quando não há nenhuma nota
 * anterior (`ratingCount === 0`, `ratingAvgBasisPoints === null`), a fórmula colapsa para
 * `rating*100`, o mesmo resultado de `computeVendorScoreAverage([rating])`.
 *
 * A avaliação só é aceita para uma OS na transição `paid -> rated` (FSM de
 * packages/domain/src/work-order/state-machine.ts) — `canTransitionWorkOrder` é checado ANTES de
 * qualquer UPDATE, e a OS precisa pertencer ao MESMO prestador informado (evita avaliar o
 * prestador errado por um `vendorId` divergente do que está de fato na OS).
 *
 * Ability: reusa `"update"`/`"vendor_profile"` (mesma ability de `updateVendorProfileAction`) em
 * vez de `"update"`/`"work_order"` — a MUTAÇÃO de negócio central aqui é sobre o scorecard do
 * prestador (as colunas `rating*` de `vendors`), não sobre a OS em si (a transição de status da
 * OS para `rated` é consequência da avaliação, não o contrário). Decisão documentada porque o
 * prompt desta faixa só definiu a ability `vendor_profile` para `updateVendorProfileAction`, sem
 * especificar a desta ação — reusar a mesma ability evita inventar uma terceira regra CASL para
 * a mesma entidade sem necessidade.
 */
export async function rateVendorAfterWorkOrderAction(
  input: unknown,
): Promise<ActionResult<{ ratingAvgBasisPoints: number; ratingCount: number }>> {
  const parsed = RateVendorAfterWorkOrderSchema.safeParse(input);
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

  if (session.ability.cannot("update", "vendor_profile")) {
    return { ok: false, error: "Sem permissão para avaliar prestador com o papel atual." };
  }

  try {
    const outcome = await withTenant<RateOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [workOrderRow] = await db
          .select()
          .from(workOrders)
          .where(and(eq(workOrders.id, request.workOrderId), eq(workOrders.tenantId, session.tenantId)));
        if (!workOrderRow) {
          return { kind: "business-error", error: "Ordem de serviço não encontrada." };
        }
        if (workOrderRow.vendorId !== request.vendorId) {
          return {
            kind: "business-error",
            error: "Esta ordem de serviço não pertence ao prestador informado.",
          };
        }
        if (!canTransitionWorkOrder(workOrderRow.status as WorkOrderStatus, "rated")) {
          return {
            kind: "business-error",
            error: `OS em estado "${workOrderRow.status}" não pode ser avaliada agora — precisa estar em "paid".`,
          };
        }

        const [vendorRow] = await db
          .select({ ratingAvgBasisPoints: vendors.ratingAvgBasisPoints, ratingCount: vendors.ratingCount })
          .from(vendors)
          .where(and(eq(vendors.id, request.vendorId), eq(vendors.tenantId, session.tenantId)));
        if (!vendorRow) {
          return { kind: "business-error", error: "Prestador não encontrado." };
        }

        const currentAvg = vendorRow.ratingAvgBasisPoints ?? 0;
        const currentCount = vendorRow.ratingCount;
        const newCount = currentCount + 1;
        const newAvg = Math.round((currentAvg * currentCount + request.rating * 100) / newCount);

        await db
          .update(vendors)
          .set({ ratingAvgBasisPoints: newAvg, ratingCount: newCount })
          .where(eq(vendors.id, request.vendorId));

        await db
          .update(workOrders)
          .set({ status: "rated", updatedAt: new Date() })
          .where(eq(workOrders.id, request.workOrderId));

        return { kind: "rated", ratingAvgBasisPoints: newAvg, ratingCount: newCount };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return {
      ok: true,
      data: { ratingAvgBasisPoints: outcome.ratingAvgBasisPoints, ratingCount: outcome.ratingCount },
    };
  } catch (err) {
    return toActionError(err, "Falha ao avaliar prestador.");
  }
}

type PayOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "paid"; retention: VendorRetentionAmounts };

/**
 * Dispara o pagamento de uma `accounts_payable` de prestador COM retenção (seção 9.10.3) —
 * coração desta faixa. Retenção NUNCA aceita do cliente (`PayVendorInvoiceSchema` só recebe o
 * id) — sempre recalculada aqui a partir da `VendorRetentionRule` vigente na data de hoje para o
 * `taxRegime` cadastrado do prestador. `postDoubleEntry` é o único ponto de criação de
 * `LedgerEntry` (regra dura desta faixa) — nunca inserimos em `ledgerEntries` sem passar por ele.
 */
export async function payVendorInvoiceAction(
  input: unknown,
): Promise<ActionResult<{ status: "paid"; retention: VendorRetentionAmounts }>> {
  const parsed = PayVendorInvoiceSchema.safeParse(input);
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

  // Mesma ability já usada por payAccountsPayableAction (Fase 5) — disparar o pagamento de
  // prestador é a mesma decisão consequente de "materializar o pagamento de uma conta a pagar",
  // só que com retenção adicional; não é um verbo novo.
  if (session.ability.cannot("approve", "accounts_payable")) {
    return { ok: false, error: "Sem permissão para pagar prestador com o papel atual." };
  }

  try {
    const outcome = await withTenant<PayOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [apRow] = await db
          .select()
          .from(accountsPayable)
          .where(and(eq(accountsPayable.id, request.accountsPayableId), eq(accountsPayable.tenantId, session.tenantId)));
        if (!apRow) {
          return { kind: "business-error", error: "Conta a pagar não encontrada." };
        }
        if (apRow.status === "paid") {
          return { kind: "business-error", error: "Esta conta a pagar já foi paga." };
        }

        const [vendorRow] = await db
          .select()
          .from(vendors)
          .where(and(eq(vendors.id, apRow.vendorId), eq(vendors.tenantId, session.tenantId)));
        if (!vendorRow) {
          return { kind: "business-error", error: "Fornecedor da conta a pagar não encontrado." };
        }
        if (!vendorRow.taxRegime || !isVendorTaxRegime(vendorRow.taxRegime)) {
          return {
            kind: "business-error",
            error: "Cadastre o regime de tributação do prestador antes de pagar.",
          };
        }
        const taxRegime = vendorRow.taxRegime;

        const ruleRows = await db
          .select()
          .from(vendorRetentionRules)
          .where(eq(vendorRetentionRules.tenantId, session.tenantId));
        if (ruleRows.length === 0) {
          return {
            kind: "business-error",
            error: "Nenhuma vendor_retention_rule cadastrada para este tenant — cadastre a regra de retenção vigente antes de pagar.",
          };
        }
        const rules = ruleRows.map(toDomainRetentionRule);

        const today = civilDate(new Date().toISOString().slice(0, 10));

        let rule: VendorRetentionRule;
        try {
          rule = resolveVendorRetentionRuleForDate(rules, { taxRegime, date: today });
        } catch (err) {
          if (
            err instanceof NoVendorRetentionRuleForRegimeError ||
            err instanceof OverlappingVendorRetentionRuleValidityError
          ) {
            return { kind: "business-error", error: err.message };
          }
          throw err;
        }

        const retention = calculateVendorRetentionAmountsCents(apRow.amountCents, rule);
        const currency = asCurrencyCode(apRow.currency);

        const cashAccountId = await findOrCreateAccount(db, session.tenantId, "cash", "Caixa", "asset");
        const vendorExpenseAccountId = await findOrCreateAccount(
          db,
          session.tenantId,
          expenseAccountCodeForCategory(vendorRow.category),
          `Despesa - ${vendorRow.category}`,
          "expense",
        );
        const inssRetentionAccountId = await findOrCreateAccount(
          db,
          session.tenantId,
          "retention_inss_payable",
          "INSS retido a recolher",
          "liability",
        );
        const irrfRetentionAccountId = await findOrCreateAccount(
          db,
          session.tenantId,
          "retention_irrf_payable",
          "IRRF retido a recolher",
          "liability",
        );
        const csrfRetentionAccountId = await findOrCreateAccount(
          db,
          session.tenantId,
          "retention_csrf_payable",
          "CSRF retido a recolher",
          "liability",
        );
        const issRetentionAccountId = await findOrCreateAccount(
          db,
          session.tenantId,
          "retention_iss_payable",
          "ISS retido a recolher",
          "liability",
        );

        const lines = entriesForVendorPayment({
          vendorExpenseAccountId,
          cashAccountId,
          inssRetentionAccountId,
          irrfRetentionAccountId,
          csrfRetentionAccountId,
          issRetentionAccountId,
          grossAmountCents: apRow.amountCents,
          retention,
          currency,
        });
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

        // Um único UPDATE grava tanto o status quanto o snapshot de retenção calculado — o
        // `retentionBreakdown` (jsonb) é o registro do que foi de fato retido NESTE pagamento
        // (packages/db/src/schema/accounts-payable.ts, comentário da coluna); não é recalculado
        // depois se a vendor_retention_rule mudar.
        await db
          .update(accountsPayable)
          .set({ status: "paid", retentionBreakdown: retention })
          .where(eq(accountsPayable.id, apRow.id));

        return { kind: "paid", retention };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: "paid", retention: outcome.retention } };
  } catch (err) {
    return toActionError(err, "Falha ao pagar prestador.");
  }
}
