import { describe, expect, it } from "vitest";
import { postDoubleEntry } from "./post-double-entry";
import { OriginalLedgerEntryNotFoundError, entriesForPaymentCaptured, entriesForRefund } from "./posting-rules";

function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe("entriesForPaymentCaptured — I2, pagamento capturado", () => {
  it("gera linhas que fecham (débito líquido + débito taxa == crédito bruto)", () => {
    const lines = entriesForPaymentCaptured({
      reservationId: "res-1",
      unitRevenueAccountId: "acc-revenue",
      cashAccountId: "acc-cash",
      gatewayFeeExpenseAccountId: "acc-gateway-fee",
      grossAmountCents: 10000,
      gatewayFeeAmountCents: 300,
      currency: "BRL",
    });

    // Prova real de que fecha: roda através de postDoubleEntry, que rejeitaria se desbalanceado.
    const entries = postDoubleEntry({
      tenantId: "tenant-1",
      lines,
      createdAtEpochMs: 0,
      idGenerator: idGen("le"),
    });

    expect(entries).toHaveLength(3);
    const cashLine = entries.find((e) => e.accountId === "acc-cash")!;
    const feeLine = entries.find((e) => e.accountId === "acc-gateway-fee")!;
    const revenueLine = entries.find((e) => e.accountId === "acc-revenue")!;

    expect(cashLine.direction).toBe("debit");
    expect(cashLine.amountCents).toBe(9700); // 10000 - 300
    expect(feeLine.direction).toBe("debit");
    expect(feeLine.amountCents).toBe(300);
    expect(revenueLine.direction).toBe("credit");
    expect(revenueLine.amountCents).toBe(10000);
    expect(entries.every((e) => e.reservationId === "res-1")).toBe(true);
  });
});

describe("entriesForRefund — I3, estorno referencia o lançamento original", () => {
  it("gera linhas inversas que fecham e carregam reversalOfId apontando para o original", () => {
    const captured = entriesForPaymentCaptured({
      reservationId: "res-1",
      unitRevenueAccountId: "acc-revenue",
      cashAccountId: "acc-cash",
      gatewayFeeExpenseAccountId: "acc-gateway-fee",
      grossAmountCents: 10000,
      gatewayFeeAmountCents: 300,
      currency: "BRL",
    });
    const originalEntries = postDoubleEntry({
      tenantId: "tenant-1",
      lines: captured,
      createdAtEpochMs: 0,
      idGenerator: idGen("le"),
    });

    const refundLines = entriesForRefund({
      reservationId: "res-1",
      originalEntries,
      cashAccountId: "acc-cash",
      unitRevenueAccountId: "acc-revenue",
      refundAmountCents: 4000, // estorno parcial
      currency: "BRL",
    });

    // Prova real de que fecha.
    const refundEntries = postDoubleEntry({
      tenantId: "tenant-1",
      lines: refundLines,
      createdAtEpochMs: 1,
      idGenerator: idGen("le-refund"),
    });

    expect(refundEntries).toHaveLength(2);
    const cashRefund = refundEntries.find((e) => e.accountId === "acc-cash")!;
    const revenueRefund = refundEntries.find((e) => e.accountId === "acc-revenue")!;

    expect(cashRefund.direction).toBe("credit");
    expect(cashRefund.amountCents).toBe(4000);
    const originalCash = originalEntries.find((e) => e.accountId === "acc-cash")!;
    expect(cashRefund.reversalOfId).toBe(originalCash.id);

    expect(revenueRefund.direction).toBe("debit");
    const originalRevenue = originalEntries.find((e) => e.accountId === "acc-revenue")!;
    expect(revenueRefund.reversalOfId).toBe(originalRevenue.id);
  });

  it("REJEITA estorno que não consegue localizar o lançamento original de caixa", () => {
    expect(() =>
      entriesForRefund({
        reservationId: "res-1",
        originalEntries: [],
        cashAccountId: "acc-cash",
        unitRevenueAccountId: "acc-revenue",
        refundAmountCents: 1000,
        currency: "BRL",
      }),
    ).toThrow(OriginalLedgerEntryNotFoundError);
  });
});
