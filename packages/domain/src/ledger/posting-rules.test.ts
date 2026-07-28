import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import { calculateVendorRetentionAmountsCents, type VendorRetentionRule } from "../vendor/retention";
import { postDoubleEntry } from "./post-double-entry";
import {
  OriginalLedgerEntryNotFoundError,
  entriesForChannelCommission,
  entriesForPaymentCaptured,
  entriesForPayoutSettlement,
  entriesForRefund,
  entriesForVendorPayment,
} from "./posting-rules";

function makeVendorRetentionRule(overrides: Partial<VendorRetentionRule> = {}): VendorRetentionRule {
  return {
    id: "rule-1",
    tenantId: "tenant-1",
    taxRegime: "pj_cessao_mao_obra",
    inssBasisPoints: 1100,
    irrfBasisPoints: 150,
    csrfBasisPoints: 465,
    issBasisPoints: 500,
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    ...overrides,
  };
}

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

describe("entriesForChannelCommission — I1/9.2, reserva externa (collected by channel)", () => {
  it("gera linhas que fecham (débito recebível líquido + débito comissão == crédito bruto)", () => {
    const lines = entriesForChannelCommission({
      reservationId: "res-airbnb-1",
      unitRevenueAccountId: "acc-revenue",
      channelReceivableAccountId: "acc-channel-receivable",
      channelCommissionExpenseAccountId: "acc-channel-commission",
      grossAmountCents: 50000,
      commissionAmountCents: 7500,
      currency: "BRL",
    });

    const entries = postDoubleEntry({
      tenantId: "tenant-1",
      lines,
      createdAtEpochMs: 0,
      idGenerator: idGen("le-channel"),
    });

    expect(entries).toHaveLength(3);
    const receivableLine = entries.find((e) => e.accountId === "acc-channel-receivable")!;
    const commissionLine = entries.find((e) => e.accountId === "acc-channel-commission")!;
    const revenueLine = entries.find((e) => e.accountId === "acc-revenue")!;

    expect(receivableLine.direction).toBe("debit");
    expect(receivableLine.amountCents).toBe(42500); // 50000 - 7500
    expect(commissionLine.direction).toBe("debit");
    expect(commissionLine.amountCents).toBe(7500);
    expect(revenueLine.direction).toBe("credit");
    expect(revenueLine.amountCents).toBe(50000);
    expect(entries.every((e) => e.reservationId === "res-airbnb-1")).toBe(true);
  });
});

describe("entriesForPayoutSettlement — Fase 5, baixa do repasse ao proprietário", () => {
  it("gera linhas que fecham (débito no passivo == crédito em caixa)", () => {
    const lines = entriesForPayoutSettlement({
      payoutLiabilityAccountId: "acc-payout-liability",
      cashAccountId: "acc-cash",
      netPayoutCents: 480000,
      currency: "BRL",
    });

    // Prova real de que fecha: roda através de postDoubleEntry, que rejeitaria se desbalanceado.
    const entries = postDoubleEntry({
      tenantId: "tenant-1",
      lines,
      createdAtEpochMs: 0,
      idGenerator: idGen("le-payout"),
    });

    expect(entries).toHaveLength(2);
    const liabilityLine = entries.find((e) => e.accountId === "acc-payout-liability")!;
    const cashLine = entries.find((e) => e.accountId === "acc-cash")!;

    expect(liabilityLine.direction).toBe("debit");
    expect(liabilityLine.amountCents).toBe(480000);
    expect(cashLine.direction).toBe("credit");
    expect(cashLine.amountCents).toBe(480000);
  });

  it("propaga reservationId opcional quando fornecido, e omite quando ausente", () => {
    const withReservation = entriesForPayoutSettlement({
      reservationId: "res-1",
      payoutLiabilityAccountId: "acc-payout-liability",
      cashAccountId: "acc-cash",
      netPayoutCents: 10000,
      currency: "BRL",
    });
    expect(withReservation.every((line) => line.reservationId === "res-1")).toBe(true);

    const withoutReservation = entriesForPayoutSettlement({
      payoutLiabilityAccountId: "acc-payout-liability",
      cashAccountId: "acc-cash",
      netPayoutCents: 10000,
      currency: "BRL",
    });
    expect(withoutReservation.every((line) => line.reservationId === undefined)).toBe(true);
  });
});

describe("entriesForVendorPayment — Fase 7, pagamento de prestador com retenções", () => {
  it("pj_cessao_mao_obra: débito bruto na despesa, créditos em líquido + 4 retenções fecham", () => {
    const rule = makeVendorRetentionRule({ taxRegime: "pj_cessao_mao_obra" });
    const retention = calculateVendorRetentionAmountsCents(100000, rule);

    const lines = entriesForVendorPayment({
      workOrderId: "wo-1",
      vendorExpenseAccountId: "acc-vendor-expense",
      cashAccountId: "acc-cash",
      inssRetentionAccountId: "acc-inss",
      irrfRetentionAccountId: "acc-irrf",
      csrfRetentionAccountId: "acc-csrf",
      issRetentionAccountId: "acc-iss",
      grossAmountCents: 100000,
      retention,
      currency: "BRL",
    });

    // Prova real de que fecha: roda através de postDoubleEntry, que rejeitaria se desbalanceado.
    const entries = postDoubleEntry({
      tenantId: "tenant-1",
      lines,
      createdAtEpochMs: 0,
      idGenerator: idGen("le-vendor"),
    });

    expect(entries).toHaveLength(6); // despesa + caixa + 4 retenções (todas > 0 neste regime)
    expect(entries.find((e) => e.accountId === "acc-vendor-expense")!.direction).toBe("debit");
    expect(entries.find((e) => e.accountId === "acc-vendor-expense")!.amountCents).toBe(100000);
    expect(entries.find((e) => e.accountId === "acc-cash")!.direction).toBe("credit");
    expect(entries.find((e) => e.accountId === "acc-cash")!.amountCents).toBe(retention.netCents);
    expect(entries.find((e) => e.accountId === "acc-inss")!.amountCents).toBe(retention.inssCents);
    expect(entries.find((e) => e.accountId === "acc-irrf")!.amountCents).toBe(retention.irrfCents);
    expect(entries.find((e) => e.accountId === "acc-csrf")!.amountCents).toBe(retention.csrfCents);
    expect(entries.find((e) => e.accountId === "acc-iss")!.amountCents).toBe(retention.issCents);
  });

  it("pj_simples: sem retenções (basis points zerados) — omite as 4 linhas de retenção de valor zero", () => {
    const rule = makeVendorRetentionRule({
      taxRegime: "pj_simples",
      inssBasisPoints: 0,
      irrfBasisPoints: 0,
      csrfBasisPoints: 0,
      issBasisPoints: 0,
    });
    const retention = calculateVendorRetentionAmountsCents(50000, rule);

    const lines = entriesForVendorPayment({
      vendorExpenseAccountId: "acc-vendor-expense",
      cashAccountId: "acc-cash",
      inssRetentionAccountId: "acc-inss",
      irrfRetentionAccountId: "acc-irrf",
      csrfRetentionAccountId: "acc-csrf",
      issRetentionAccountId: "acc-iss",
      grossAmountCents: 50000,
      retention,
      currency: "BRL",
    });

    expect(lines).toHaveLength(2); // só despesa + caixa — nenhuma retenção incide neste regime
    expect(lines.some((l) => l.accountId === "acc-inss")).toBe(false);
    expect(lines.some((l) => l.accountId === "acc-irrf")).toBe(false);
    expect(lines.some((l) => l.accountId === "acc-csrf")).toBe(false);
    expect(lines.some((l) => l.accountId === "acc-iss")).toBe(false);

    const entries = postDoubleEntry({
      tenantId: "tenant-1",
      lines,
      createdAtEpochMs: 0,
      idGenerator: idGen("le-vendor-simples"),
    });
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.accountId === "acc-cash")!.amountCents).toBe(50000);
  });

  it("pf_autonomo: omite só a linha de retenção cujo valor é zero (csrf), mantém as demais", () => {
    const rule = makeVendorRetentionRule({
      taxRegime: "pf_autonomo",
      inssBasisPoints: 1100,
      irrfBasisPoints: 275,
      csrfBasisPoints: 0,
      issBasisPoints: 500,
    });
    const retention = calculateVendorRetentionAmountsCents(333, rule);

    const lines = entriesForVendorPayment({
      vendorExpenseAccountId: "acc-vendor-expense",
      cashAccountId: "acc-cash",
      inssRetentionAccountId: "acc-inss",
      irrfRetentionAccountId: "acc-irrf",
      csrfRetentionAccountId: "acc-csrf",
      issRetentionAccountId: "acc-iss",
      grossAmountCents: 333,
      retention,
      currency: "BRL",
    });

    expect(lines.some((l) => l.accountId === "acc-csrf")).toBe(false);
    expect(lines.some((l) => l.accountId === "acc-inss")).toBe(true);
    expect(lines.some((l) => l.accountId === "acc-irrf")).toBe(true);
    expect(lines.some((l) => l.accountId === "acc-iss")).toBe(true);

    // Prova real de que fecha mesmo com o valor bruto de 3 dígitos que quebra arredondamento
    // ingênuo (333) — postDoubleEntry rejeitaria se desbalanceado.
    const entries = postDoubleEntry({
      tenantId: "tenant-1",
      lines,
      createdAtEpochMs: 0,
      idGenerator: idGen("le-vendor-pf"),
    });
    expect(entries.find((e) => e.accountId === "acc-vendor-expense")!.amountCents).toBe(333);
  });
});
