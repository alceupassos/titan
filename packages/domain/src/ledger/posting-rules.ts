// Regras de contabilização (posting rules) — dado um evento de pagamento (I2) e os ids de conta
// relevantes, retorna as `LedgerLine[]` a postar via `postDoubleEntry`. Zero I/O: nenhuma destas
// funções resolve id de conta nem persiste nada — isso é responsabilidade da borda (packages/db /
// packages/payments) no Passo 2+ desta fase.
import type { CurrencyCode } from "@titan/money";
import type { VendorRetentionAmounts } from "../vendor/retention";
import type { Cents, LedgerEntry } from "./ledger-entry";
import type { LedgerLine } from "./post-double-entry";

export class OriginalLedgerEntryNotFoundError extends Error {
  constructor(accountId: string, direction: string) {
    super(
      `Nenhum lançamento original encontrado na conta ${accountId} (${direction}) — um estorno ` +
        "precisa referenciar o lançamento original pelo id (I3), nunca estornar 'no escuro'.",
    );
    this.name = "OriginalLedgerEntryNotFoundError";
  }
}

export interface EntriesForPaymentCapturedParams {
  readonly reservationId: string;
  readonly unitRevenueAccountId: string;
  readonly cashAccountId: string;
  readonly gatewayFeeExpenseAccountId: string;
  readonly grossAmountCents: Cents;
  readonly gatewayFeeAmountCents: Cents;
  readonly currency: CurrencyCode;
}

/**
 * Pagamento capturado (I2, estado `captured` de `packages/domain/src/payment/state-machine.ts`):
 * débito em caixa pelo valor líquido (bruto − taxa de gateway), débito na despesa de taxa de
 * gateway pela taxa, crédito na receita de hospedagem pelo valor bruto. Fecha por construção:
 * (bruto − taxa) + taxa == bruto — `postDoubleEntry` é quem prova isso no teste.
 */
export function entriesForPaymentCaptured(params: EntriesForPaymentCapturedParams): LedgerLine[] {
  const netCashCents = params.grossAmountCents - params.gatewayFeeAmountCents;
  return [
    {
      accountId: params.cashAccountId,
      direction: "debit",
      amountCents: netCashCents,
      currency: params.currency,
      reservationId: params.reservationId,
    },
    {
      accountId: params.gatewayFeeExpenseAccountId,
      direction: "debit",
      amountCents: params.gatewayFeeAmountCents,
      currency: params.currency,
      reservationId: params.reservationId,
    },
    {
      accountId: params.unitRevenueAccountId,
      direction: "credit",
      amountCents: params.grossAmountCents,
      currency: params.currency,
      reservationId: params.reservationId,
    },
  ];
}

export interface EntriesForRefundParams {
  readonly reservationId: string;
  /** Lançamentos originais desta reserva (tipicamente o resultado de um `entriesForPaymentCaptured`
   * anterior já postado) — usados só para localizar o `id` a referenciar em `reversalOfId`; nunca
   * mutados. */
  readonly originalEntries: readonly LedgerEntry[];
  readonly cashAccountId: string;
  readonly unitRevenueAccountId: string;
  readonly refundAmountCents: Cents;
  readonly currency: CurrencyCode;
}

/**
 * Estorno (I3): gera as linhas INVERSAS do lançamento original pelo valor do estorno — crédito em
 * caixa (dinheiro saindo), débito em receita (receita revertida). Não reverte tudo automaticamente
 * se for estorno parcial — só o `refundAmountCents` pedido. Cada linha carrega `reversalOfId`
 * apontando para o `id` do lançamento original correspondente (achado I3: correção nunca edita,
 * só referencia).
 */
export interface EntriesForChannelCommissionParams {
  readonly reservationId: string;
  readonly unitRevenueAccountId: string;
  /** Conta de ativo — valor a receber do canal (OTA), ainda não liquidado na conta bancária da
   * Titan. Diferente de `cashAccountId` em `entriesForPaymentCaptured`: reserva "collected by
   * channel" (seção 9.2 do prompt único) não tem captura de gateway própria — o canal recebe do
   * hóspede e repassa à Titan depois, então o lançamento inicial é um recebível, não caixa. */
  readonly channelReceivableAccountId: string;
  readonly channelCommissionExpenseAccountId: string;
  readonly grossAmountCents: Cents;
  readonly commissionAmountCents: Cents;
  readonly currency: CurrencyCode;
}

/**
 * Reserva externa confirmada (I1, via `mapExternalReservationToDomain` +
 * `canAcceptReservation`/constraint EXCLUDE): débito no recebível do canal pelo valor líquido
 * (bruto − comissão), débito na despesa de comissão de canal pela comissão, crédito na receita de
 * hospedagem pelo valor bruto — mesma forma de `entriesForPaymentCaptured`, com "caixa" trocado
 * por "recebível do canal" porque o dinheiro ainda não chegou à conta bancária da Titan.
 */
export function entriesForChannelCommission(params: EntriesForChannelCommissionParams): LedgerLine[] {
  const netReceivableCents = params.grossAmountCents - params.commissionAmountCents;
  return [
    {
      accountId: params.channelReceivableAccountId,
      direction: "debit",
      amountCents: netReceivableCents,
      currency: params.currency,
      reservationId: params.reservationId,
    },
    {
      accountId: params.channelCommissionExpenseAccountId,
      direction: "debit",
      amountCents: params.commissionAmountCents,
      currency: params.currency,
      reservationId: params.reservationId,
    },
    {
      accountId: params.unitRevenueAccountId,
      direction: "credit",
      amountCents: params.grossAmountCents,
      currency: params.currency,
      reservationId: params.reservationId,
    },
  ];
}

export function entriesForRefund(params: EntriesForRefundParams): LedgerLine[] {
  const originalCashEntry = params.originalEntries.find(
    (e) => e.accountId === params.cashAccountId && e.direction === "debit" && e.currency === params.currency,
  );
  if (!originalCashEntry) {
    throw new OriginalLedgerEntryNotFoundError(params.cashAccountId, "debit");
  }

  const originalRevenueEntry = params.originalEntries.find(
    (e) =>
      e.accountId === params.unitRevenueAccountId && e.direction === "credit" && e.currency === params.currency,
  );
  if (!originalRevenueEntry) {
    throw new OriginalLedgerEntryNotFoundError(params.unitRevenueAccountId, "credit");
  }

  return [
    {
      accountId: params.cashAccountId,
      direction: "credit",
      amountCents: params.refundAmountCents,
      currency: params.currency,
      reservationId: params.reservationId,
      reversalOfId: originalCashEntry.id,
    },
    {
      accountId: params.unitRevenueAccountId,
      direction: "debit",
      amountCents: params.refundAmountCents,
      currency: params.currency,
      reservationId: params.reservationId,
      reversalOfId: originalRevenueEntry.id,
    },
  ];
}

export interface EntriesForPayoutSettlementParams {
  /** Opcional — repasse é apurado por período/proprietário (ver `packages/domain/src/
   * administration/payout-extract.ts`), não por reserva individual. Presente só quando o
   * chamador quiser rastrear a baixa de repasse até uma reserva específica (ex.: operação com
   * proprietário de uma única unidade/reserva); em repasses que consolidam várias reservas do
   * período, deixe indefinido — não force um id arbitrário só para preencher o campo. */
  readonly reservationId?: string;
  /** Conta passivo — "repasse a proprietário a pagar". */
  readonly payoutLiabilityAccountId: string;
  readonly cashAccountId: string;
  readonly netPayoutCents: Cents;
  readonly currency: CurrencyCode;
}

/**
 * Baixa (settlement) do repasse ao proprietário: débito no passivo "repasse a proprietário"
 * (baixa a obrigação), crédito em caixa (dinheiro saindo da conta da Titan). Fecha por
 * construção: as duas linhas têm o MESMO valor (`netPayoutCents`) — `postDoubleEntry` é quem
 * prova isso no teste.
 *
 * Fronteira de escopo (documentada explicitamente, não escondida): esta função assume que o
 * passivo "repasse a proprietário" JÁ FOI PROVISIONADO em algum lançamento anterior — o momento
 * em que a comissão da Titan é calculada e o líquido devido ao proprietário nasce como obrigação
 * (`credit` em `payoutLiabilityAccountId`, contrapartida do reconhecimento de receita/comissão).
 * Modelar essa provisão (a partir de `computePayoutExtract`) NÃO é escopo deste Passo 1 — fica
 * para quando o worker/fila de repasse (Fase 5, passo posterior) precisar dela de verdade. Esta
 * função cobre só a ponta final: o dinheiro efetivamente saindo quando o repasse é pago,
 * consistente com a dupla aprovação e o step-up acima de R$ 5.000
 * (docs/decisoes-de-negocio.md, pergunta 5; `packages/domain/src/approval/step-up.ts`).
 */
export function entriesForPayoutSettlement(params: EntriesForPayoutSettlementParams): LedgerLine[] {
  return [
    {
      accountId: params.payoutLiabilityAccountId,
      direction: "debit",
      amountCents: params.netPayoutCents,
      currency: params.currency,
      ...(params.reservationId !== undefined ? { reservationId: params.reservationId } : {}),
    },
    {
      accountId: params.cashAccountId,
      direction: "credit",
      amountCents: params.netPayoutCents,
      currency: params.currency,
      ...(params.reservationId !== undefined ? { reservationId: params.reservationId } : {}),
    },
  ];
}

export interface EntriesForVendorPaymentParams {
  /** Opcional — nem todo pagamento de prestador vem de uma OS (ex.: contrato de serviço
   * recorrente sem `work_order` individual). Não é propagado para `LedgerLine` porque esse tipo
   * (mesmo que `LedgerEntry`) só modela vínculo com `reservationId`/`reversalOfId` hoje — não
   * existe campo de work order na tabela de lançamentos. Aceito aqui só para o chamador poder
   * registrar a origem/rastreabilidade fora do ledger (ex.: log de auditoria, `work_orders`),
   * mesmo padrão de "extensão de shape só quando o tipo já suporta" já seguido em
   * `entriesForPayoutSettlement`/`entriesForRefund`. */
  readonly workOrderId?: string;
  readonly vendorExpenseAccountId: string;
  readonly cashAccountId: string;
  readonly inssRetentionAccountId: string;
  readonly irrfRetentionAccountId: string;
  readonly csrfRetentionAccountId: string;
  readonly issRetentionAccountId: string;
  readonly grossAmountCents: Cents;
  /** De `../vendor/retention.ts` — já garante, por construção de
   * `calculateVendorRetentionAmountsCents`, que `netCents` + as 4 retenções somam
   * `grossAmountCents` exatamente. */
  readonly retention: VendorRetentionAmounts;
  readonly currency: CurrencyCode;
}

/**
 * Pagamento a prestador com retenções (seção 9.10.3): débito na despesa de prestador pelo BRUTO,
 * crédito em caixa pelo LÍQUIDO, crédito em cada conta de retenção pelo valor retido
 * correspondente. Cada linha de retenção só é incluída se o valor for `> 0` — evita linha de
 * R$ 0,00 no ledger quando o regime do prestador não tem aquela retenção (ex.: `pj_simples` sem
 * INSS/IRRF/CSRF/ISS retidos). Fecha por construção: o débito bruto == soma dos créditos é
 * garantido pela invariante já provada em `calculateVendorRetentionAmountsCents` (`netCents` + as
 * 4 retenções == `grossCents`) — `postDoubleEntry` confirma isso no teste, esta função não
 * recalcula nem revalida a soma.
 */
export function entriesForVendorPayment(params: EntriesForVendorPaymentParams): LedgerLine[] {
  const { retention } = params;

  const lines: LedgerLine[] = [
    {
      accountId: params.vendorExpenseAccountId,
      direction: "debit",
      amountCents: params.grossAmountCents,
      currency: params.currency,
    },
    {
      accountId: params.cashAccountId,
      direction: "credit",
      amountCents: retention.netCents,
      currency: params.currency,
    },
  ];

  const retentionLines: ReadonlyArray<[string, Cents]> = [
    [params.inssRetentionAccountId, retention.inssCents],
    [params.irrfRetentionAccountId, retention.irrfCents],
    [params.csrfRetentionAccountId, retention.csrfCents],
    [params.issRetentionAccountId, retention.issCents],
  ];

  for (const [accountId, amountCents] of retentionLines) {
    if (amountCents > 0) {
      lines.push({
        accountId,
        direction: "credit",
        amountCents,
        currency: params.currency,
      });
    }
  }

  return lines;
}
