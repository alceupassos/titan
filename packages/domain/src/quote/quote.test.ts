import { money } from "@titan/money";
import { civilDate, stay } from "@titan/dates";
import { describe, expect, it } from "vitest";
import type { RatePlan } from "../rate-plan/rate-plan";
import { MinStayViolationError } from "../rate-plan/rate-plan";
import { createQuote, isQuoteExpired } from "./quote";

const ratePlan: RatePlan = {
  id: "rp-1",
  tenantId: "tenant-1",
  unitId: "unit-1",
  name: "Tarifa padrão",
  nightlyPrice: money(20000, "BRL"),
  minStayNights: 0,
  validFrom: civilDate("2026-01-01"),
  validTo: civilDate("2026-12-31"),
};

describe("createQuote — cotação com preço calculado no servidor e TTL", () => {
  it("calcula o preço via priceStay e define expiração a partir de now + ttl", () => {
    const quote = createQuote({
      id: "quote-1",
      unitId: "unit-1",
      stay: stay("2026-06-01", "2026-06-04"),
      ratePlan,
      nowEpochMs: 1_000_000,
      ttlMs: 15 * 60 * 1000, // 15 minutos
    });

    expect(quote.priceAmount).toEqual(money(60000, "BRL"));
    expect(quote.expiresAtEpochMs).toBe(1_000_000 + 15 * 60 * 1000);
  });

  it("propaga o erro de priceStay quando a estadia viola a mínima do plano", () => {
    const shortStayPlan: RatePlan = { ...ratePlan, minStayNights: 10 };
    expect(() =>
      createQuote({
        id: "quote-2",
        unitId: "unit-1",
        stay: stay("2026-06-01", "2026-06-04"),
        ratePlan: shortStayPlan,
        nowEpochMs: 0,
        ttlMs: 1000,
      }),
    ).toThrow(MinStayViolationError);
  });
});

describe("isQuoteExpired", () => {
  it("retorna false antes da expiração e true depois", () => {
    const quote = createQuote({
      id: "quote-1",
      unitId: "unit-1",
      stay: stay("2026-06-01", "2026-06-04"),
      ratePlan,
      nowEpochMs: 1000,
      ttlMs: 500,
    });
    expect(isQuoteExpired(quote, 1400)).toBe(false);
    expect(isQuoteExpired(quote, 1500)).toBe(true); // exatamente no limite conta como expirado
  });
});
