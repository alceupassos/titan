import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import { buildNaturalKey } from "./natural-key";

describe("buildNaturalKey", () => {
  it("é determinística — mesma entrada sempre produz a mesma chave", () => {
    const params = {
      reservationId: "res-1",
      event: "checkout" as const,
      referenceDate: civilDate("2026-06-15"),
    };
    expect(buildNaturalKey(params)).toBe(buildNaturalKey(params));
    expect(buildNaturalKey({ ...params })).toBe(buildNaturalKey({ ...params }));
  });

  it("reservationId diferente produz chave diferente", () => {
    const base = {
      event: "checkout" as const,
      referenceDate: civilDate("2026-06-15"),
    };
    expect(buildNaturalKey({ ...base, reservationId: "res-1" })).not.toBe(
      buildNaturalKey({ ...base, reservationId: "res-2" }),
    );
  });

  it("event diferente produz chave diferente", () => {
    const base = {
      reservationId: "res-1",
      referenceDate: civilDate("2026-06-15"),
    };
    expect(buildNaturalKey({ ...base, event: "checkout" })).not.toBe(
      buildNaturalKey({ ...base, event: "payment_captured" }),
    );
  });

  it("referenceDate diferente produz chave diferente (essencial para monthly_accrual repetido na mesma reserva)", () => {
    const base = {
      reservationId: "res-1",
      event: "monthly_accrual" as const,
    };
    expect(
      buildNaturalKey({ ...base, referenceDate: civilDate("2026-06-30") }),
    ).not.toBe(buildNaturalKey({ ...base, referenceDate: civilDate("2026-07-31") }));
  });
});
