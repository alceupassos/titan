import { describe, expect, it } from "vitest";
import { civilDate, nights, overlaps, stay } from "./index";

describe("CivilDate / Stay", () => {
  it("rejeita formato que não seja YYYY-MM-DD", () => {
    expect(() => civilDate("2026-12-24T00:00:00Z")).toThrow(/Data civil inválida/);
  });

  it("rejeita checkout <= checkin", () => {
    expect(() => stay("2026-12-24", "2026-12-24")).toThrow(/posterior/);
  });

  it("calcula noites corretamente", () => {
    expect(nights(stay("2026-12-24", "2026-12-27"))).toBe(3);
  });

  it("detecta sobreposição (mesma semântica de I1 / EXCLUDE USING gist)", () => {
    const a = stay("2026-12-24", "2026-12-27");
    const b = stay("2026-12-26", "2026-12-29");
    expect(overlaps(a, b)).toBe(true);
  });

  it("não detecta sobreposição quando checkout de uma é o checkin da outra (adjacente, permitido)", () => {
    const a = stay("2026-12-24", "2026-12-27");
    const b = stay("2026-12-27", "2026-12-30");
    expect(overlaps(a, b)).toBe(false);
  });
});
