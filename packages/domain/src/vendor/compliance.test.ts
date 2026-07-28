import { describe, expect, it } from "vitest";
import { EmptyRatingsError, computeVendorScoreAverage } from "./compliance";

describe("computeVendorScoreAverage", () => {
  it("calcula a média aritmética simples das notas", () => {
    expect(computeVendorScoreAverage([5, 4, 3])).toBe(4);
  });

  it("calcula a média com um único rating", () => {
    expect(computeVendorScoreAverage([5])).toBe(5);
  });

  it("lança EmptyRatingsError para array vazio — nunca retorna 0/NaN silencioso", () => {
    expect(() => computeVendorScoreAverage([])).toThrow(EmptyRatingsError);
  });
});
