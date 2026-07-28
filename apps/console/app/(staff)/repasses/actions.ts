"use server";

// Server Actions do fluxo de repasse ao proprietário (Fase 5, Passo 4b — docs/fase-atual.md;
// seção 9.4.1 do prompt único, Camadas 2 e 3; docs/decisoes-de-negocio.md, perguntas 4 e 5).
// Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza (CASL) dentro dela
// mesma" — as três ações abaixo fazem as duas coisas por conta própria, sem confiar em nenhuma
// checagem anterior (nem no `proxy.ts`, que só confere presença de cookie — ver
// apps/console/lib/auth/session.ts). Mesmo estilo de
// apps/console/app/(staff)/reservas/nova/actions.ts e apps/console/app/(staff)/aprovacoes/actions.ts.
//
// Escopo desta faixa: SÓ este diretório (apps/console/app/(staff)/repasses/*). As faixas paralelas
// da mesma sessão mexem em (staff)/financeiro (AP), (owner)/portal e (staff)/financeiro/dre — não
// tocadas aqui.
import { randomUUID, createHash, createHmac } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { ApprovePayoutBatchSchema, CreatePayoutBatchSchema } from "@titan/contracts";
import {
  buildStepUpChallenge,
  computePayoutExtract,
  entriesForPayoutSettlement,
  postDoubleEntry,
  resolveAdministrationContractForDate,
  verifyStepUpChallenge,
  type AdministrationContract,
  type ApprovalImpact,
  type Cents,
} from "@titan/domain";
import { civilDate, type CivilDate } from "@titan/dates";
import type { CurrencyCode } from "@titan/money";
import {
  accounts,
  administrationContracts,
  approvalRequests,
  ledgerEntries,
  payoutBatches,
  reservations,
  withTenant,
} from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Limiar de dupla aprovação + step-up (docs/decisoes-de-negocio.md, pergunta 5, confirmada):
// repasse líquido >= R$ 5.000 (500000 centavos) exige requiredApprovals=2 e stepUpRequired=true
// (seção 9.4.1, Camada 3). Abaixo disso, uma única aprovação (Camada 2 — maker-checker via
// CHECK de banco em payout_batches) já é suficiente.
const STEP_UP_THRESHOLD_CENTS = 500000;

// Janela de validade do desafio de step-up — 8 minutos, dentro da faixa "5-10 minutos" sugerida
// pela tarefa. Curto o bastante para não virar um "token permanente" de fato, longo o bastante
// para o usuário ler a confirmação (seção 9.4.1: "a tela mostra exatamente o que entra no hash")
// sem pressa artificial.
const STEP_UP_EXPIRY_MS = 8 * 60 * 1000;

// `packages/contracts/src/financial.ts` ainda não tem um schema dedicado para "enviar lote para
// aprovação" (só `CreatePayoutBatchSchema`/`ApprovePayoutBatchSchema`) — schema local, mesmo
// espírito dos dois acima, sem alterar `packages/contracts` (fora do escopo desta faixa: só
// `apps/console/app/(staff)/repasses/*`). Regra dura do CLAUDE.md raiz continua valendo mesmo
// para uma Server Action sem schema compartilhado — validar aqui, não pular a validação.
const SubmitPayoutBatchForApprovalSchema = z.object({
  payoutBatchId: z.string().uuid(),
});

/** Erros de sessão/tenant e de domínio (`Error` de validação) já chegam com mensagem pt-BR pronta
 * para exibição — nunca deixamos uma exceção não tratada vazar para o cliente (o cliente só vê
 * `ActionResult`). Mesmo padrão de reservas/nova/actions.ts e aprovacoes/actions.ts. */
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
  throw new Error(`Moeda desconhecida no lote de repasse: "${value}".`);
}

function toDomainAdministrationContract(row: typeof administrationContracts.$inferSelect): AdministrationContract {
  return {
    id: row.id,
    tenantId: row.tenantId,
    unitId: row.unitId,
    commissionBasisPoints: row.commissionBasisPoints,
    itemPaymentModel: row.itemPaymentModel === "owner_pays_itemized" ? "owner_pays_itemized" : "titan_pays_all",
    validFrom: civilDate(row.validFrom),
    validTo: civilDate(row.validTo),
  };
}

/** Chave do server key do step-up (`packages/domain/src/approval/step-up.ts`) — segredo
 * criptográfico, NUNCA hardcoded nem com fallback silencioso de produção. Só aceita ausência em
 * ambiente onde isso é claramente sinalizado (erro explícito), diferente do padrão de
 * `apps/worker/src/config.ts` para URLs de infraestrutura (essas podem ter default de
 * desenvolvimento local; uma chave de assinatura não pode). */
function requireStepUpServerKey(): string {
  const key = process.env.STEP_UP_SERVER_KEY;
  if (!key) {
    throw new Error(
      "STEP_UP_SERVER_KEY não configurada no ambiente — não é possível montar/validar o desafio " +
        "de step-up de repasse (seção 9.4.1, Camada 3) sem um segredo real. Nunca cai para um " +
        "valor padrão silencioso.",
    );
  }
  return key;
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** HMAC de verdade (crypto.createHmac) — passado como `hmacFn` para `buildStepUpChallenge`/
 * `verifyStepUpChallenge` (packages/domain/src/approval/step-up.ts), que documentam
 * explicitamente que o fallback interno (hash com chave concatenada) NÃO é criptograficamente
 * equivalente a HMAC — esta borda real sempre fornece o HMAC verdadeiro. */
function hmacSha256Hex(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex");
}

/** Serialização canônica do payload do lote — chaves em ordem fixa, exatamente o shape acordado
 * com o chamador desta faixa. Determinístico: o mesmo lote sempre produz a mesma string, condição
 * necessária para `verifyStepUpChallenge` reconstruir o mesmo desafio na aprovação. */
function canonicalPayoutBatchPayload(params: {
  payoutBatchId: string;
  netAmountCents: Cents;
  unitId: string;
  periodStart: string;
  periodEnd: string;
}): string {
  return JSON.stringify({
    payoutBatchId: params.payoutBatchId,
    netAmountCents: params.netAmountCents,
    unitId: params.unitId,
    periodStart: params.periodStart,
    periodEnd: params.periodEnd,
  });
}

/** Shape persistido dentro do `impact` (jsonb) da `approval_requests` quando o lote exige
 * step-up — `approval_requests`/`payout_batches` não têm coluna própria para nonce/expiração
 * (schema de packages/db/src/schema/approval-request.ts e payout-batch.ts), então guardamos aqui,
 * ao lado de `amountCents`/`affectedEntities` (`ApprovalImpact` já é um jsonb livre). Decisão
 * documentada explicitamente, não escondida — revisar se uma coluna dedicada vier a fazer mais
 * sentido em fase futura. */
interface PayoutStepUpImpact extends ApprovalImpact {
  readonly stepUp?: {
    readonly nonce: string;
    readonly expiresAtEpochMs: number;
    readonly canonicalPayload: string;
  };
}

export async function createPayoutBatchAction(
  input: unknown,
): Promise<ActionResult<{ payoutBatchId: string; netAmountCents: Cents }>> {
  const parsed = CreatePayoutBatchSchema.safeParse(input);
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

  // Montar o rascunho do lote é leitura de tarifa/contrato + um INSERT em status "draft" (ainda
  // não é decisão financeira executada — só apuração). "read" sobre payout_batch já é suficiente
  // para iniciar o rascunho; a ação consequente (enviar para aprovação, aprovar) exige "approve"
  // mais adiante. `titan.finance` já tem `can("read", "payout_batch")` desde a Fase 0
  // (packages/auth/src/abilities.ts) — nenhuma ability nova precisou ser adicionada.
  if (session.ability.cannot("read", "payout_batch")) {
    return { ok: false, error: "Sem permissão para apurar repasse com o papel atual." };
  }

  let periodStart: CivilDate;
  let periodEnd: CivilDate;
  try {
    periodStart = civilDate(request.periodStartISO);
    periodEnd = civilDate(request.periodEndISO);
  } catch (err) {
    return toActionError(err, "Período inválido.");
  }
  if (periodStart >= periodEnd) {
    return { ok: false, error: "Data final do período deve ser posterior à data inicial." };
  }

  try {
    const result = await withTenant(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const contractRows = await db
          .select()
          .from(administrationContracts)
          .where(eq(administrationContracts.unitId, request.unitId));
        if (contractRows.length === 0) {
          throw new Error(
            "Nenhum administration_contract cadastrado para esta unidade — cadastre o contrato " +
              "de administração vigente antes de apurar o repasse (docs/decisoes-de-negocio.md, " +
              "pergunta 4).",
          );
        }
        const contracts = contractRows.map(toDomainAdministrationContract);
        // Resolve pela data final do período — mesma convenção de "vigência na data de referência"
        // já usada para tax_rule (fiscal). Se o contrato mudar NO MEIO do período apurado, isso é
        // uma ambiguidade que `resolveAdministrationContractForDate` já detecta e recusa
        // silenciar (OverlappingAdministrationContractError não se aplica aqui — o erro real
        // seria um contrato cobrindo o início e outro cobrindo o fim, não sobreposição; fora de
        // escopo tratar troca de contrato NO MEIO do período nesta passada, documentado como
        // limitação conhecida).
        const contract = resolveAdministrationContractForDate(contracts, {
          unitId: request.unitId,
          date: periodEnd,
        });

        // Receita bruta do período: soma de `priceCents` das reservas CONFIRMADAS desta unidade
        // cuja estadia (`stay`, daterange) intersecta o período apurado — fonte escolhida em vez
        // de "lançamentos de receita já postados" porque nem toda reserva confirmada
        // necessariamente já tem lançamento de captura postado nesta fase (packages/payments
        // ainda cobre só 2 gateways sandbox, Fase 2) e porque "receita reconhecida no período da
        // estadia" é a definição mais direta e auditável de receita bruta para fins de repasse —
        // decisão documentada explicitamente, revisável se o financeiro completo (Fase 5, regime
        // caixa/competência) exigir outra fonte mais adiante.
        const overlappingReservations = await db
          .select({ priceCents: reservations.priceCents, currency: reservations.currency })
          .from(reservations)
          .where(
            and(
              eq(reservations.unitId, request.unitId),
              eq(reservations.status, "confirmed"),
              sql`${reservations.stay} && daterange(${periodStart}::date, ${periodEnd}::date, '[]')`,
            ),
          );

        if (overlappingReservations.length === 0) {
          throw new Error("Nenhuma reserva confirmada encontrada para esta unidade no período informado.");
        }

        const currency = asCurrencyCode(overlappingReservations[0]!.currency);
        const mismatchedCurrency = overlappingReservations.find((row) => row.currency !== currency);
        if (mismatchedCurrency) {
          throw new Error(
            "Reservas do período têm moedas diferentes — apuração de repasse multi-moeda não é " +
              "suportada nesta fase.",
          );
        }
        const grossRevenueCents = overlappingReservations.reduce((sum, row) => sum + row.priceCents, 0);

        // Preço/extrato SEMPRE recalculado no servidor — nenhum valor aceito do cliente (regra
        // dura do CLAUDE.md raiz), mesmo espírito de `priceStay` em reservas/nova/actions.ts.
        const extract = computePayoutExtract({ grossRevenueCents, currency, contract });

        const [row] = await db
          .insert(payoutBatches)
          .values({
            tenantId: session.tenantId,
            unitId: request.unitId,
            periodStart,
            periodEnd,
            grossAmountCents: extract.grossRevenueCents,
            commissionAmountCents: extract.commissionCents,
            expensesAmountCents: extract.itemizedExpensesCents,
            netAmountCents: extract.netPayoutCents,
            currency: extract.currency,
            status: "draft",
            createdBy: session.userId,
          })
          .returning({ id: payoutBatches.id });

        if (!row) {
          throw new Error("INSERT de lote de repasse não retornou id.");
        }

        return { payoutBatchId: row.id, netAmountCents: extract.netPayoutCents };
      },
    );

    return { ok: true, data: result };
  } catch (err) {
    return toActionError(err, "Falha ao apurar lote de repasse.");
  }
}

export async function submitPayoutBatchForApprovalAction(
  input: unknown,
): Promise<ActionResult<{ status: string; requiredApprovals: 1 | 2; stepUpChallenge?: string }>> {
  const parsed = SubmitPayoutBatchForApprovalSchema.safeParse(input);
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

  if (session.ability.cannot("read", "payout_batch")) {
    return { ok: false, error: "Sem permissão para enviar repasse para aprovação com o papel atual." };
  }

  try {
    const outcome = await withTenant(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [batch] = await db
          .select()
          .from(payoutBatches)
          .where(and(eq(payoutBatches.id, request.payoutBatchId), eq(payoutBatches.status, "draft")));

        if (!batch) {
          return {
            kind: "business-error" as const,
            error: "Lote de repasse não encontrado ou não está em rascunho.",
          };
        }

        const requiresStepUp = batch.netAmountCents >= STEP_UP_THRESHOLD_CENTS;
        const requiredApprovals: 1 | 2 = requiresStepUp ? 2 : 1;

        let stepUpChallenge: string | undefined;
        let impact: PayoutStepUpImpact = {
          amountCents: batch.netAmountCents,
          affectedEntities: [`payout_batch:${batch.id}`, `unit:${batch.unitId}`],
        };

        if (requiresStepUp) {
          const canonicalPayload = canonicalPayoutBatchPayload({
            payoutBatchId: batch.id,
            netAmountCents: batch.netAmountCents,
            unitId: batch.unitId,
            periodStart: batch.periodStart,
            periodEnd: batch.periodEnd,
          });
          const nonce = randomUUID();
          const expiresAtEpochMs = Date.now() + STEP_UP_EXPIRY_MS;
          const serverKey = requireStepUpServerKey();

          stepUpChallenge = buildStepUpChallenge({
            canonicalPayload,
            serverKey,
            nonce,
            expiresAtEpochMs,
            hashFn: sha256Hex,
            hmacFn: hmacSha256Hex,
          });

          impact = { ...impact, stepUp: { nonce, expiresAtEpochMs, canonicalPayload } };
        }

        const [approvalRow] = await db
          .insert(approvalRequests)
          .values({
            tenantId: session.tenantId,
            type: "payout_batch",
            requestedBy: session.userId,
            rationale: `Repasse da unidade ${batch.unitId}, período ${batch.periodStart} a ${batch.periodEnd}.`,
            impact,
            risk: requiresStepUp ? "high" : "medium",
            requiredApprovals,
            stepUpRequired: requiresStepUp,
            slaAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
          })
          .returning({ id: approvalRequests.id });

        if (!approvalRow) {
          throw new Error("INSERT de approval_request não retornou id.");
        }

        await db
          .update(payoutBatches)
          .set({ status: "pending_approval", approvalRequestId: approvalRow.id })
          .where(eq(payoutBatches.id, batch.id));

        return {
          kind: "submitted" as const,
          status: "pending_approval",
          requiredApprovals,
          ...(stepUpChallenge !== undefined ? { stepUpChallenge } : {}),
        };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return {
      ok: true,
      data: {
        status: outcome.status,
        requiredApprovals: outcome.requiredApprovals,
        ...(outcome.stepUpChallenge !== undefined ? { stepUpChallenge: outcome.stepUpChallenge } : {}),
      },
    };
  } catch (err) {
    return toActionError(err, "Falha ao enviar lote de repasse para aprovação.");
  }
}

// Código de erro do Postgres para violação de CHECK constraint — mesma convenção de tradução já
// usada para 23P01 (EXCLUDE) em reservas/nova/actions.ts. A CHECK `payout_batches_maker_checker`
// (packages/db/migrations/0006_financeiro.sql) é o árbitro FINAL de verdade (Camada 2 literal);
// a checagem de aplicação abaixo, ANTES do UPDATE, existe só para dar um erro de negócio claro em
// vez de deixar vazar um erro cru de violação de CHECK — mesmo espírito do tratamento de 23P01.
const POSTGRES_CHECK_VIOLATION = "23514";

function isCheckViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_CHECK_VIOLATION
  );
}

export async function approvePayoutBatchAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = ApprovePayoutBatchSchema.safeParse(input);
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

  if (session.ability.cannot("approve", "payout_batch")) {
    return { ok: false, error: "Sem permissão para aprovar repasse com o papel atual." };
  }

  try {
    const outcome = await withTenant(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [batch] = await db
          .select()
          .from(payoutBatches)
          .where(and(eq(payoutBatches.id, request.payoutBatchId), eq(payoutBatches.status, "pending_approval")));

        if (!batch) {
          return {
            kind: "business-error" as const,
            error: "Lote de repasse não encontrado ou não está aguardando aprovação.",
          };
        }

        // CRÍTICO — Camada 2 (maker-checker), seção 9.4.1: confere em código, ANTES de qualquer
        // tentativa de UPDATE, que quem aprova não é quem criou. A CHECK de banco
        // (payout_batches_maker_checker) é o árbitro final que nunca pode ser contornado por um
        // bug aqui em cima — mas recusar cedo, com mensagem de negócio clara, é melhor UX do que
        // deixar vazar um erro cru de violação de CHECK (23514) para quem está aprovando.
        if (session.userId === batch.createdBy) {
          return {
            kind: "business-error" as const,
            error:
              "Quem cria o lote de repasse não pode aprová-lo (maker-checker, seção 9.4.1, " +
              "Camada 2) — peça para outra pessoa com permissão de aprovação decidir.",
          };
        }

        if (!batch.approvalRequestId) {
          return {
            kind: "business-error" as const,
            error: "Lote de repasse sem solicitação de aprovação vinculada — reenvie para aprovação.",
          };
        }

        const [approvalRow] = await db
          .select()
          .from(approvalRequests)
          .where(and(eq(approvalRequests.id, batch.approvalRequestId), eq(approvalRequests.status, "pending")));

        if (!approvalRow) {
          return {
            kind: "business-error" as const,
            error: "Solicitação de aprovação não encontrada ou já decidida.",
          };
        }

        const impact = approvalRow.impact as PayoutStepUpImpact;

        if (approvalRow.stepUpRequired) {
          if (!request.stepUpToken) {
            return {
              kind: "business-error" as const,
              error: "Este repasse exige step-up (segunda confirmação) — informe o token de step-up.",
            };
          }
          if (!impact.stepUp) {
            return {
              kind: "business-error" as const,
              error:
                "Solicitação marcada como stepUpRequired mas sem desafio de step-up persistido — " +
                "estado inconsistente, não é possível validar.",
            };
          }

          const serverKey = requireStepUpServerKey();
          const isValid = verifyStepUpChallenge({
            challenge: request.stepUpToken,
            canonicalPayload: impact.stepUp.canonicalPayload,
            serverKey,
            nonce: impact.stepUp.nonce,
            expiresAtEpochMs: impact.stepUp.expiresAtEpochMs,
            nowEpochMs: Date.now(),
            hashFn: sha256Hex,
            hmacFn: hmacSha256Hex,
          });

          if (!isValid) {
            return {
              kind: "business-error" as const,
              error: "Token de step-up inválido ou expirado — nunca aprovamos mesmo assim.",
            };
          }
        }

        // Plano de contas mínimo para a baixa do repasse — mesmo padrão `findOrCreateAccount`
        // inline já usado em apps/worker/src/payment-repo.ts (não há uma função exportada
        // reutilizável de @titan/db para isso ainda; implementado aqui, documentado). Contas
        // por unidade (`code` inclui o unitId) para o passivo de repasse não misturar saldo entre
        // unidades diferentes.
        const payoutLiabilityCode = `payout_liability:${batch.unitId}`;
        const [existingLiability] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.tenantId, session.tenantId), eq(accounts.code, payoutLiabilityCode)));
        const payoutLiabilityAccountId =
          existingLiability?.id ??
          (
            await db
              .insert(accounts)
              .values({
                tenantId: session.tenantId,
                code: payoutLiabilityCode,
                name: `Repasse a pagar — unidade ${batch.unitId}`,
                kind: "liability",
              })
              .returning({ id: accounts.id })
          )[0]?.id;
        if (!payoutLiabilityAccountId) {
          throw new Error(`Falha ao resolver/criar conta "${payoutLiabilityCode}".`);
        }

        const cashCode = "cash:titan";
        const [existingCash] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.tenantId, session.tenantId), eq(accounts.code, cashCode)));
        const cashAccountId =
          existingCash?.id ??
          (
            await db
              .insert(accounts)
              .values({ tenantId: session.tenantId, code: cashCode, name: "Caixa — Titan", kind: "asset" })
              .returning({ id: accounts.id })
          )[0]?.id;
        if (!cashAccountId) {
          throw new Error(`Falha ao resolver/criar conta "${cashCode}".`);
        }

        const lines = entriesForPayoutSettlement({
          payoutLiabilityAccountId,
          cashAccountId,
          netPayoutCents: batch.netAmountCents,
          currency: asCurrencyCode(batch.currency),
        });
        const entries = postDoubleEntry({
          tenantId: session.tenantId,
          lines,
          createdAtEpochMs: Date.now(),
          idGenerator: randomUUID,
        });

        // INSERT do lançamento e UPDATE do status/aprovador — fora de qualquer try/catch de "erro
        // de negócio esperado" abaixo: se a CHECK de banco (maker-checker) disparar mesmo depois
        // da checagem de aplicação acima (condição de corrida entre duas aprovações concorrentes,
        // por exemplo), o erro sobe intacto até o catch externo desta função, que traduz
        // especificamente 23514 — mesma disciplina de 23P01 em reservas/nova/actions.ts.
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

        await db
          .update(payoutBatches)
          .set({ status: "approved", approvedBy: session.userId })
          .where(eq(payoutBatches.id, batch.id));

        await db
          .update(approvalRequests)
          .set({ status: "approved", decidedBy: session.userId, decidedAt: new Date() })
          .where(eq(approvalRequests.id, approvalRow.id));

        return { kind: "approved" as const, status: "approved" };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: outcome.status } };
  } catch (err) {
    if (isCheckViolation(err)) {
      return {
        ok: false,
        error:
          "Aprovação recusada pelo banco (maker-checker, seção 9.4.1 Camada 2) — quem cria o lote " +
          "não pode aprová-lo.",
      };
    }
    return toActionError(err, "Falha ao aprovar lote de repasse.");
  }
}
