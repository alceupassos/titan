import { describe, expect, it } from "vitest";
import { add, format, isNegative, isZero, money, scale, subtract } from "./index";

describe("Money", () => {
  it("rejeita valor não inteiro (float) — docs/anti-padroes.md #9", () => {
    expect(() => money(10.5, "BRL")).toThrow(/inteiro/);
  });

  it("soma valores na mesma moeda", () => {
    expect(add(money(1000, "BRL"), money(250, "BRL"))).toEqual(money(1250, "BRL"));
  });

  it("rejeita operação entre moedas diferentes sem conversão explícita", () => {
    expect(() => add(money(100, "BRL"), money(100, "USD"))).toThrow(/moedas distintas/);
  });

  it("subtrai e detecta negativo", () => {
    const result = subtract(money(500, "BRL"), money(700, "BRL"));
    expect(isNegative(result)).toBe(true);
  });

  it("escala preservando centavos inteiros", () => {
    expect(scale(money(1000, "BRL"), 0.1)).toEqual(money(100, "BRL"));
  });

  it("zero é zero", () => {
    expect(isZero(money(0, "BRL"))).toBe(true);
  });

  it("formata para exibição sem alterar o valor armazenado", () => {
    expect(format(money(150000, "BRL"))).toContain("1.500,00");
  });
});
