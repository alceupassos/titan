import { money } from "@titan/money";
import { civilDate, stay } from "@titan/dates";
import { describe, expect, it } from "vitest";
import {
  MinStayViolationError,
  RatePlanNotValidForStayError,
  priceStay,
  ratePlanCoversStay,
  type RatePlan,
} from "./rate-plan";

function makeRatePlan(overrides: Partial<RatePlan> = {}): RatePlan {
  return {
    id: "rp-1",
    tenantId: "tenant-1",
    unitId: "unit-1",
    name: "Tarifa padrão",
    nightlyPrice: money(20000, "BRL"), // R$ 200,00/noite
    minStayNights: 0,
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    ...overrides,
  };
}

describe("priceStay — cálculo de preço por diária", () => {
  it("multiplica preço por diária pelo número de noites", () => {
    const ratePlan = makeRatePlan();
    const s = stay("2026-06-01", "2026-06-04"); // 3 noites
    expect(priceStay(ratePlan, s)).toEqual(money(60000, "BRL"));
  });

  it("REJEITA estadia abaixo da mínima do plano", () => {
    const ratePlan = makeRatePlan({ minStayNights: 5 });
    const s = stay("2026-06-01", "2026-06-03"); // 2 noites
    expect(() => priceStay(ratePlan, s)).toThrow(MinStayViolationError);
  });

  it("REJEITA estadia fora da janela de vigência do plano", () => {
    const ratePlan = makeRatePlan({
      validFrom: civilDate("2026-01-01"),
      validTo: civilDate("2026-03-31"),
    });
    const s = stay("2026-06-01", "2026-06-04");
    expect(() => priceStay(ratePlan, s)).toThrow(RatePlanNotValidForStayError);
  });

  it("ratePlanCoversStay confirma cobertura dentro da janela", () => {
    const ratePlan = makeRatePlan();
    expect(ratePlanCoversStay(ratePlan, stay("2026-06-01", "2026-06-04"))).toBe(true);
  });
});
