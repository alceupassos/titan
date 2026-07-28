import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import type { AdministrationContract } from "./administration-contract";
import { computePayoutExtract } from "./payout-extract";

function makeContract(overrides: Partial<AdministrationContract> = {}): AdministrationContract {
  return {
    id: "contract-1",
    tenantId: "tenant-1",
    unitId: "unit-1",
    commissionBasisPoints: 2000, // 20,00%
    itemPaymentModel: "titan_pays_all",
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    ...overrides,
  };
}

describe("computePayoutExtract — titan_pays_all", () => {
  it("ignora despesas itemizadas mesmo se fornecidas — nunca cobra o proprietário fora do contrato", () => {
    const contract = makeContract({ itemPaymentModel: "titan_pays_all" });
    const extract = computePayoutExtract({
      grossRevenueCents: 100000,
      currency: "BRL",
      contract,
      itemizedExpenses: [
        { description: "Limpeza", amountCents: 15000 },
        { description: "Enxoval", amountCents: 5000 },
      ],
    });

    expect(extract.itemizedExpensesCents).toBe(0);
    expect(extract.lineItems).toEqual([]);
    expect(extract.commissionCents).toBe(20000); // 20% de 100000
    expect(extract.netPayoutCents).toBe(80000); // 100000 - 20000 - 0
  });

  it("calcula extrato correto sem nenhuma despesa itemizada informada", () => {
    const contract = makeContract({ itemPaymentModel: "titan_pays_all" });
    const extract = computePayoutExtract({
      grossRevenueCents: 100000,
      currency: "BRL",
      contract,
    });

    expect(extract.itemizedExpensesCents).toBe(0);
    expect(extract.lineItems).toEqual([]);
    expect(extract.netPayoutCents).toBe(80000);
  });
});

describe("computePayoutExtract — owner_pays_itemized", () => {
  it("soma despesas itemizadas corretamente e desconta do líquido", () => {
    const contract = makeContract({ itemPaymentModel: "owner_pays_itemized", commissionBasisPoints: 1500 });
    const lineItems = [
      { description: "Limpeza", amountCents: 15000 },
      { description: "Enxoval", amountCents: 5000 },
      { description: "Manutenção", amountCents: 3000 },
    ];
    const extract = computePayoutExtract({
      grossRevenueCents: 100000,
      currency: "BRL",
      contract,
      itemizedExpenses: lineItems,
    });

    expect(extract.commissionCents).toBe(15000); // 15% de 100000
    expect(extract.itemizedExpensesCents).toBe(23000); // 15000 + 5000 + 3000
    expect(extract.lineItems).toEqual(lineItems);
    expect(extract.netPayoutCents).toBe(62000); // 100000 - 15000 - 23000
  });

  it("trata ausência de despesas itemizadas como zero despesas (nunca lança)", () => {
    const contract = makeContract({ itemPaymentModel: "owner_pays_itemized" });
    const extract = computePayoutExtract({
      grossRevenueCents: 100000,
      currency: "BRL",
      contract,
    });

    expect(extract.itemizedExpensesCents).toBe(0);
    expect(extract.lineItems).toEqual([]);
  });
});

describe("computePayoutExtract — arredondamento da comissão", () => {
  it("arredonda quando o valor não divide exato (mesmo padrão de calculateTaxAmountCents)", () => {
    const contract = makeContract({ commissionBasisPoints: 333 }); // 3,33%
    const extract = computePayoutExtract({
      grossRevenueCents: 10001,
      currency: "BRL",
      contract,
    });
    expect(extract.commissionCents).toBe(Math.round((10001 * 333) / 10000));
    expect(extract.commissionCents).toBe(333);
  });
});
