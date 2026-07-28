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
//   g. (Fase 4, Passo 4b) — imediatamente após confirmar a reserva, enfileira a emissão fiscal
//      (`event: "payment_captured"`, `../fiscal-queue.ts`) — o gatilho mais natural e realista da
//      seção 9.6 ("checkout, captura, virada de mês"): é o mesmo ponto onde a reserva vira
//      `confirmed` e o lançamento de ledger é postado, então o valor bruto (`grossAmountCents`) e
//      o `reservationId` já estão disponíveis sem nenhuma consulta extra. `enqueueFiscalIssuance`
//      é OPCIONAL nos deps (default: não enfileira nada) — mantém todos os testes existentes
//      deste arquivo passando sem precisar injetar a fila fiscal; `index.ts` (bootstrap real) é
//      quem passa a função de enfileiramento de verdade.
//
//      DÍVIDA TÉCNICA documentada (não escondida — mesmo espírito da nota sobre
//      `gatewayFeeAmountCents = 0` abaixo): nem `reservations` nem `payment_intents`
//      (packages/db/src/schema/) têm hoje uma coluna para o CPF/CNPJ do hóspede (tomador do
//      serviço) nem para o código de município da unidade — os dois são bounded contexts
//      (`identity`/`crm` para o hóspede, `inventory` para a unidade) ainda não modelados. Por
//      isso `deps.fiscalDefaults` carrega um `municipalityCode`/`serviceCode` fixo (configurável,
//      não hardcoded em dois lugares) e `takerDocument` usa um placeholder claro
//      (`"00000000000"`) até esses campos existirem — igual ao propósito de
//      `NoTaxRuleForDateError`/`FiscalGatewayRejectionError`, que existem exatamente para nunca
//      deixar isso passar batido: um documento com CPF placeholder é esperado a ser REJEITADO
//      pelo provedor real (rejeição de negócio, não de rede) até este gap ser fechado.
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
import { civilDateFromEpochMs } from "../channel-sync-dates";
import type { FiscalIssuanceJobPayload } from "../fiscal-queue";
import type { PaymentRepo } from "../payment-repo";
import type { WebhookJobPayload } from "../queue";

/** Defaults usados para montar o payload de emissão fiscal disparada por `payment_captured` — ver
 * nota de dívida técnica no topo do arquivo sobre `takerDocument`/`municipalityCode` ainda não
 * terem coluna própria. */
export interface FiscalIssuanceDefaults {
  readonly municipalityCode: string;
  readonly serviceCode: string;
}

const PLACEHOLDER_TAKER_DOCUMENT = "00000000000";

export interface ProcessWebhookDeps {
  adminDb: Pick<AdminDb, "findPaymentIntentByExternalId">;
  paymentRepo: PaymentRepo;
  /** epoch ms — injetado, nunca `Date.now()` direto no corpo da função (mesmo padrão de
   * `postDoubleEntry`/`PostDoubleEntryParams.createdAtEpochMs`). */
  now(): number;
  idGenerator(): string;
  /** Enfileira a emissão fiscal (`../fiscal-queue.ts::enqueueFiscalIssuanceJob`, tipicamente) —
   * OPCIONAL: quando ausente, o passo (g) é pulado inteiramente (sem alterar nenhum comportamento
   * já existente/testado deste job). Assinatura deliberadamente estreita (só o payload, sem o tipo
   * de retorno de `EnqueueFiscalIssuanceResult`) para não acoplar este arquivo à forma exata da
   * fila BullMQ. */
  enqueueFiscalIssuance?(payload: FiscalIssuanceJobPayload): Promise<unknown>;
  fiscalDefaults?: FiscalIssuanceDefaults;
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

  // Passo (g) — ver nota de topo do arquivo. Enfileirado DEPOIS de confirmar a reserva e postar o
  // ledger (ambos já persistidos) — uma falha ao enfileirar a emissão fiscal NUNCA desfaz nem
  // impede o que já foi confirmado; é logada e engolida aqui, não relançada, porque relançar
  // faria o BullMQ reprocessar o job de webhook INTEIRO (reautorizando a transição de status e,
  // pior, tentando postar o MESMO lançamento de ledger de novo — `postDoubleEntry`/
  // `insertLedgerEntries` não são chamados de forma idempotente hoje, então isso duplicaria
  // dinheiro). Enfileirar a emissão fiscal, ao contrário, É seguro de tentar de novo depois (o
  // próprio worker de fiscal-issuance tem retry/backoff próprio, `../fiscal-queue.ts`) — mas essa
  // nova tentativa precisa vir de fora deste job (ex.: reprocesso manual, ou virada de mês como
  // rede de segurança), não de um retry automático do webhook.
  if (deps.enqueueFiscalIssuance && deps.fiscalDefaults) {
    const fiscalPayload: FiscalIssuanceJobPayload = {
      tenantId: ctx.tenantId,
      reservationId: intent.reservationId,
      event: "payment_captured",
      referenceDateISO: civilDateFromEpochMs(deps.now()),
      municipalityCode: deps.fiscalDefaults.municipalityCode,
      serviceCode: deps.fiscalDefaults.serviceCode,
      baseAmountCents: grossAmountCents,
      currency: intent.currency,
      // TODO (dívida técnica, ver nota de topo do arquivo): CPF/CNPJ real do hóspede ainda não
      // tem coluna em `reservations`/`payment_intents` — placeholder claro até o bounded context
      // `identity`/`crm` existir. Um provedor real rejeitaria esta emissão por CPF inválido
      // (rejeição de NEGÓCIO, `FiscalGatewayRejectionError`), nunca silenciosamente aceitaria.
      takerDocument: PLACEHOLDER_TAKER_DOCUMENT,
      description: `Hospedagem — reserva ${intent.reservationId}`,
    };

    try {
      await deps.enqueueFiscalIssuance(fiscalPayload);
      log.log(`[worker] emissão fiscal enfileirada (reserva ${intent.reservationId}, evento payment_captured).`);
    } catch (err) {
      log.error(
        `[worker] falha ao enfileirar emissão fiscal (reserva ${intent.reservationId}): ${(err as Error).message}. ` +
          "Não relançado (a reserva já está confirmada e o ledger já foi postado) — precisa de reprocesso manual.",
      );
    }
  }
}
