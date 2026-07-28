import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import {
  NoVendorRetentionRuleForRegimeError,
  OverlappingVendorRetentionRuleValidityError,
  calculateVendorRetentionAmountsCents,
  resolveVendorRetentionRuleForDate,
  type VendorRetentionRule,
} from "./retention";

function makeRule(overrides: Partial<VendorRetentionRule> = {}): VendorRetentionRule {
  return {
    id: "rule-1",
    tenantId: "tenant-1",
    taxRegime: "pj_cessao_mao_obra",
    inssBasisPoints: 1100, // 11,00%
    irrfBasisPoints: 150, // 1,50%
    csrfBasisPoints: 465, // 4,65% (PIS/COFINS/CSLL combinados)
    issBasisPoints: 500, // 5,00%
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    ...overrides,
  };
}

describe("resolveVendorRetentionRuleForDate", () => {
  it("resolve a regra vigente quando exatamente uma cobre regime+data", () => {
    const rule = makeRule();
    const resolved = resolveVendorRetentionRuleForDate([rule], {
      taxRegime: "pj_cessao_mao_obra",
      date: civilDate("2026-06-15"),
    });
    expect(resolved).toBe(rule);
  });

  it("lança NoVendorRetentionRuleForRegimeError quando nenhuma regra cobre a data", () => {
    const rule = makeRule({
      validFrom: civilDate("2026-01-01"),
      validTo: civilDate("2026-03-31"),
    });
    expect(() =>
      resolveVendorRetentionRuleForDate([rule], {
        taxRegime: "pj_cessao_mao_obra",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(NoVendorRetentionRuleForRegimeError);
  });

  it("lança NoVendorRetentionRuleForRegimeError quando o regime não bate", () => {
    const rule = makeRule({ taxRegime: "pj_simples" });
    expect(() =>
      resolveVendorRetentionRuleForDate([rule], {
        taxRegime: "pf_autonomo",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(NoVendorRetentionRuleForRegimeError);
  });

  it("lança OverlappingVendorRetentionRuleValidityError quando duas regras cobrem o mesmo regime+data — nunca escolhe a primeira em silêncio", () => {
    const ruleA = makeRule({ id: "rule-a" });
    const ruleB = makeRule({ id: "rule-b" });
    expect(() =>
      resolveVendorRetentionRuleForDate([ruleA, ruleB], {
        taxRegime: "pj_cessao_mao_obra",
        date: civilDate("2026-06-15"),
      }),
    ).toThrow(OverlappingVendorRetentionRuleValidityError);
  });

  it("vigência é inclusiva nos dois extremos", () => {
    const rule = makeRule({
      validFrom: civilDate("2026-01-01"),
      validTo: civilDate("2026-01-31"),
    });
    expect(
      resolveVendorRetentionRuleForDate([rule], {
        taxRegime: "pj_cessao_mao_obra",
        date: civilDate("2026-01-01"),
      }),
    ).toBe(rule);
    expect(
      resolveVendorRetentionRuleForDate([rule], {
        taxRegime: "pj_cessao_mao_obra",
        date: civilDate("2026-01-31"),
      }),
    ).toBe(rule);
  });
});

describe("calculateVendorRetentionAmountsCents", () => {
  it("pj_cessao_mao_obra: as 4 retenções + líquido fecham exatamente contra o bruto", () => {
    const rule = makeRule({ taxRegime: "pj_cessao_mao_obra" });
    const result = calculateVendorRetentionAmountsCents(100000, rule);
    expect(
      result.netCents + result.inssCents + result.irrfCents + result.csrfCents + result.issCents,
    ).toBe(100000);
    expect(result.inssCents).toBe(11000);
    expect(result.irrfCents).toBe(1500);
    expect(result.csrfCents).toBe(4650);
    expect(result.issCents).toBe(5000);
    expect(result.netCents).toBe(100000 - 11000 - 1500 - 4650 - 5000);
  });

  it("pj_simples: sem retenções (basis points zerados) — líquido igual ao bruto", () => {
    const rule = makeRule({
      taxRegime: "pj_simples",
      inssBasisPoints: 0,
      irrfBasisPoints: 0,
      csrfBasisPoints: 0,
      issBasisPoints: 0,
    });
    const result = calculateVendorRetentionAmountsCents(50000, rule);
    expect(result.inssCents).toBe(0);
    expect(result.irrfCents).toBe(0);
    expect(result.csrfCents).toBe(0);
    expect(result.issCents).toBe(0);
    expect(result.netCents).toBe(50000);
    expect(
      result.netCents + result.inssCents + result.irrfCents + result.csrfCents + result.issCents,
    ).toBe(50000);
  });

  it("pf_autonomo: fecha exatamente mesmo com valor bruto que quebra arredondamento ingênuo (333)", () => {
    const rule = makeRule({
      taxRegime: "pf_autonomo",
      inssBasisPoints: 1100,
      irrfBasisPoints: 275,
      csrfBasisPoints: 0,
      issBasisPoints: 500,
    });
    const result = calculateVendorRetentionAmountsCents(333, rule);
    expect(
      result.netCents + result.inssCents + result.irrfCents + result.csrfCents + result.issCents,
    ).toBe(333);
  });

  it("fecha exatamente para um valor bruto de 5 dígitos que também quebra arredondamento ingênuo (100001)", () => {
    const rule = makeRule({
      taxRegime: "pj_cessao_mao_obra",
      inssBasisPoints: 1100,
      irrfBasisPoints: 150,
      csrfBasisPoints: 465,
      issBasisPoints: 500,
    });
    const result = calculateVendorRetentionAmountsCents(100001, rule);
    expect(
      result.netCents + result.inssCents + result.irrfCents + result.csrfCents + result.issCents,
    ).toBe(100001);
  });
});
