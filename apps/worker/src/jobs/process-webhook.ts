// Job BullMQ de processamento assíncrono de webhook (Fase 2, Passo 5) — roda fora do handler
// HTTP (`../http-server.ts`), que já respondeu 200 e só enfileirou. Fluxo, na ordem exigida pela
// tarefa:
//   a. resolve o tenant do `externalIntentId` (conexão admin, `../admin-db.ts`);
//   b. busca o payment_intent completo já sob `withTenant()` (`../payment-repo.ts`) — fonte de
//      verdade do processamento, nunca o recorte da consulta admin;
//   c. valida a transição de estado com `canTransitionPayment`/`transitionPayment` (I2) — nunca
//      aplica um status sem a FSM aprovar;
//   d. atualiza `payment_intents.status`;
//   e. se o novo status for `captured`: garante o plano de contas mínimo, posta o lançamento de
//      dupla entrada (I3) e confirma a reserva;
//   f. loga cada passo, sem PAN/PII (I4/LGPD básico) — nunca loga `raw` do gateway aqui (o job
//      nem recebe `raw`, ver nota em `../queue.ts`).
import {
  canTransitionPayment,
  entriesForPaymentCaptured,
  postDoubleEntry,
  transitionPayment,
  type PaymentStatus,
} from "@titan/domain";
import type { TenantContext } from "@titan/db";
import type { CurrencyCode } from "@titan/money";
import type { AdminDb } from "../admin-db";
import type { PaymentRepo } from "../payment-repo";
import type { WebhookJobPayload } from "../queue";

export interface ProcessWebhookDeps {
  adminDb: Pick<AdminDb, "findPaymentIntentByExternalId">;
  paymentRepo: PaymentRepo;
  /** epoch ms — injetado, nunca `Date.now()` direto no corpo da função (mesmo padrão de
   * `postDoubleEntry`/`PostDoubleEntryParams.createdAtEpochMs`). */
  now(): number;
  idGenerator(): string;
  logger?: Pick<Console, "log" | "error" | "warn">;
}

/** `ParsedWebhookEvent.newStatus` (packages/payments/src/port.ts) inclui "failed", que NÃO existe
 * em `PaymentStatus` (packages/domain/src/payment/state-machine.ts, I2) — a FSM não tem estado
 * terminal "failed" hoje (um pagamento que nunca chega a autorizar simplesmente fica em
 * "created"). Tratado como caso especial abaixo em vez de forçar um cast para um valor que a FSM
 * rejeitaria: dívida técnica documentada (ver relatório da tarefa), não um bug silencioso. */
function isFsmRepresentableStatus(newStatus: WebhookJobPayload["newStatus"]): newStatus is Exclude<WebhookJobPayload["newStatus"], "failed"> {
  return newStatus !== "failed";
}

const ACCOUNT_CODES = {
  cash: { code: "cash", name: "Caixa", kind: "asset" as const },
  unitRevenue: { code: "unit_revenue", name: "Receita de Hospedagem", kind: "revenue" as const },
  gatewayFeeExpense: { code: "gateway_fee_expense", name: "Taxa de Gateway", kind: "expense" as const },
};

export async function processWebhookJob(payload: WebhookJobPayload, deps: ProcessWebhookDeps): Promise<void> {
  const log = deps.logger ?? console;

  const tenantLookup = await deps.adminDb.findPaymentIntentByExternalId(payload.externalIntentId);
  if (!tenantLookup) {
    log.error(
      `[worker] payment_intent não encontrado para externalId="${payload.externalIntentId}" ` +
        `(gateway=${payload.gateway}, evento=${payload.externalEventId}). Descartado sem transição.`,
    );
    return;
  }

  const ctx: TenantContext = { tenantId: tenantLookup.tenantId, actorId: `webhook:${payload.gateway}` };

  const intent = await deps.paymentRepo.getPaymentIntentById(ctx, tenantLookup.id);
  if (!intent) {
    log.error(
      `[worker] payment_intent ${tenantLookup.id} resolvido via consulta admin mas não encontrado ` +
        `sob withTenant (tenantId=${tenantLookup.tenantId}) — inconsistência, descartado sem transição.`,
    );
    return;
  }

  if (!isFsmRepresentableStatus(payload.newStatus)) {
    log.warn(
      `[worker] status de webhook "failed" (gateway ${payload.gateway}, evento ${payload.externalEventId}) ` +
        `não é representável em PaymentStatus/I2 hoje — dívida técnica conhecida. payment_intent ` +
        `${intent.id} mantido em "${intent.status}", nenhuma transição aplicada.`,
    );
    return;
  }

  const currentStatus = intent.status as PaymentStatus;
  const targetStatus: PaymentStatus = payload.newStatus;

  if (!canTransitionPayment(currentStatus, targetStatus)) {
    log.error(
      `[worker] transição inválida (I2): "${currentStatus}" -> "${targetStatus}" para payment_intent ` +
        `${intent.id} (gateway ${payload.gateway}, evento ${payload.externalEventId}). Não aplicada.`,
    );
    return;
  }
  // Só reafirma que a FSM aprova (mesmo resultado de canTransitionPayment acima) — chamada real
  // por paridade com a regra "nunca aplicar um novo status sem checar a transição pela FSM";
  // transitionPayment lançaria se a checagem acima estivesse errada.
  transitionPayment(currentStatus, targetStatus);

  await deps.paymentRepo.updatePaymentIntentStatus(ctx, intent.id, targetStatus);
  log.log(`[worker] payment_intent ${intent.id}: "${currentStatus}" -> "${targetStatus}" (gateway ${payload.gateway}).`);

  if (targetStatus !== "captured") {
    return;
  }

  const cashAccountId = await deps.paymentRepo.findOrCreateAccount(
    ctx,
    ACCOUNT_CODES.cash.code,
    ACCOUNT_CODES.cash.name,
    ACCOUNT_CODES.cash.kind,
  );
  const unitRevenueAccountId = await deps.paymentRepo.findOrCreateAccount(
    ctx,
    ACCOUNT_CODES.unitRevenue.code,
    ACCOUNT_CODES.unitRevenue.name,
    ACCOUNT_CODES.unitRevenue.kind,
  );
  const gatewayFeeExpenseAccountId = await deps.paymentRepo.findOrCreateAccount(
    ctx,
    ACCOUNT_CODES.gatewayFeeExpense.code,
    ACCOUNT_CODES.gatewayFeeExpense.name,
    ACCOUNT_CODES.gatewayFeeExpense.kind,
  );

  // DÍVIDA TÉCNICA (documentada no relatório, não inventada em silêncio): `payment_intents` não
  // tem coluna própria para a taxa de gateway separada do valor bruto nesta fase — assumida ZERO
  // aqui (placeholder explícito), não um percentual real chutado. Quando `packages/payments`
  // ganhar um campo de taxa (retornado por `capture()`/webhook), este job passa a lê-lo em vez de
  // hardcodar.
  const grossAmountCents = intent.amountCents;
  const gatewayFeeAmountCents = 0;

  const lines = entriesForPaymentCaptured({
    reservationId: intent.reservationId,
    unitRevenueAccountId,
    cashAccountId,
    gatewayFeeExpenseAccountId,
    grossAmountCents,
    gatewayFeeAmountCents,
    currency: intent.currency as CurrencyCode,
  });

  const entries = postDoubleEntry({
    tenantId: ctx.tenantId,
    lines,
    createdAtEpochMs: deps.now(),
    idGenerator: deps.idGenerator,
  });

  await deps.paymentRepo.insertLedgerEntries(ctx, entries);
  await deps.paymentRepo.confirmReservation(ctx, intent.reservationId);

  log.log(
    `[worker] lançamentos postados (${entries.length}) e reserva ${intent.reservationId} confirmada ` +
      `(payment_intent ${intent.id}).`,
  );
}
