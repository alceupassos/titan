import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import {
  NoTaxRuleForDateError,
  OverlappingTaxRuleValidityError,
  calculateTaxAmountCents,
  resolveTaxRuleForDate,
  type TaxRule,
} from "./tax-rule";

function makeTaxRule(overrides: Partial<TaxRule> = {}): TaxRule {
  return {
    id: "rule-1",
    tenantId: "tenant-1",
    municipalityCode: "3550308", // São Paulo
    serviceCode: "9.01",
    aliquotBasisPoints: 500, // 5,00%
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    ...overrides,
  };
}

describe("resolveTaxRuleForDate", () => {
  it("resolve a regra vigente quando exatamente uma cobre a data", () => {
    const rule = makeTaxRule();
    const resolved = resolveTaxRuleForDate([rule], {
      municipalityCode: "3550308",
      serviceCode: "9.01",
      date: civilDate("2026-06-15"),
    });
    expect(resolved).toBe(rule);
  });

  it("lança NoTaxRuleForDateError quando nenhuma regra cobre a data", () => {
    const rule = makeTaxRule({
      validFrom: civilDate("2026-01-01"),
      validTo: civilDate("2026-03-31"),
    });
    expect(() =>
      resolveTaxRuleForDate([rule], {
        municipalityCode: "3550308",
        serviceCode: "9.01",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(NoTaxRuleForDateError);
  });

  it("lança NoTaxRuleForDateError quando município ou serviço não batem", () => {
    const rule = makeTaxRule();
    expect(() =>
      resolveTaxRuleForDate([rule], {
        municipalityCode: "3304557", // Rio de Janeiro — não cadastrado
        serviceCode: "9.01",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(NoTaxRuleForDateError);
  });

  it("lança OverlappingTaxRuleValidityError quando duas regras cobrem a mesma data — nunca escolhe a primeira em silêncio", () => {
    const ruleA = makeTaxRule({ id: "rule-a" });
    const ruleB = makeTaxRule({ id: "rule-b" });
    expect(() =>
      resolveTaxRuleForDate([ruleA, ruleB], {
        municipalityCode: "3550308",
        serviceCode: "9.01",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(OverlappingTaxRuleValidityError);
  });

  it("vigência é inclusiva nos dois extremos", () => {
    const rule = makeTaxRule({
      validFrom: civilDate("2026-01-01"),
      validTo: civilDate("2026-01-31"),
    });
    expect(
      resolveTaxRuleForDate([rule], {
        municipalityCode: "3550308",
        serviceCode: "9.01",
        date: civilDate("2026-01-01"),
      }),
    ).toBe(rule);
    expect(
      resolveTaxRuleForDate([rule], {
        municipalityCode: "3550308",
        serviceCode: "9.01",
        date: civilDate("2026-01-31"),
      }),
    ).toBe(rule);
  });
});

describe("calculateTaxAmountCents", () => {
  it("calcula 5% sobre R$ 1000,00 = R$ 50,00", () => {
    const rule = makeTaxRule({ aliquotBasisPoints: 500 });
    expect(calculateTaxAmountCents(100000, rule)).toBe(5000);
  });

  it("arredonda quando o valor não divide exato", () => {
    const rule = makeTaxRule({ aliquotBasisPoints: 333 }); // 3,33%
    // 10000 * 333 / 10000 = 333.0 exato; usa um caso que força arredondamento:
    expect(calculateTaxAmountCents(10001, rule)).toBe(Math.round((10001 * 333) / 10000));
    expect(calculateTaxAmountCents(10001, rule)).toBe(333); // 333.0333... arredonda para 333
  });
});
