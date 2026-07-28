// Regras de contabilização (posting rules) — dado um evento de pagamento (I2) e os ids de conta
// relevantes, retorna as `LedgerLine[]` a postar via `postDoubleEntry`. Zero I/O: nenhuma destas
// funções resolve id de conta nem persiste nada — isso é responsabilidade da borda (packages/db /
// packages/payments) no Passo 2+ desta fase.
import type { CurrencyCode } from "@titan/money";
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
