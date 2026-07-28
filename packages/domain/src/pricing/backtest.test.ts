import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import { EmptyBacktestHistoryError, runBacktest, type BacktestNight } from "./backtest";

function makeNight(overrides: Partial<BacktestNight> = {}): BacktestNight {
  return {
    date: civilDate("2026-01-05"),
    fixedPriceCents: 20000,
    suggestedPriceCents: 20000,
    simulatedOccupiedAtFixedPrice: true,
    simulatedOccupiedAtSuggestedPrice: true,
    ...overrides,
  };
}

describe("runBacktest", () => {
  it("prova o portão de saída: cenário favorável produz ΔRevPAR >= 0", () => {
    // 4 noites: preço fixo sempre 20000 mas só ocupa 2 delas (RevPAR = 40000/4 = 10000). Preço
    // sugerido é mais baixo nas noites de baixa demanda (ocupa todas as 4) e mais alto nas de
    // alta demanda (ocupa igual ao fixo) -> RevPAR sugerido estritamente maior.
    const nights = [
      makeNight({ fixedPriceCents: 20000, suggestedPriceCents: 15000, simulatedOccupiedAtFixedPrice: false, simulatedOccupiedAtSuggestedPrice: true }),
      makeNight({ fixedPriceCents: 20000, suggestedPriceCents: 15000, simulatedOccupiedAtFixedPrice: false, simulatedOccupiedAtSuggestedPrice: true }),
      makeNight({ fixedPriceCents: 20000, suggestedPriceCents: 22000, simulatedOccupiedAtFixedPrice: true, simulatedOccupiedAtSuggestedPrice: true }),
      makeNight({ fixedPriceCents: 20000, suggestedPriceCents: 22000, simulatedOccupiedAtFixedPrice: true, simulatedOccupiedAtSuggestedPrice: true }),
    ];

    const result = runBacktest(nights);

    expect(result.nightsCount).toBe(4);
    expect(result.fixedRevParCents).toBe(10000); // (0+0+20000+20000)/4
    expect(result.suggestedRevParCents).toBe(18500); // (15000+15000+22000+22000)/4
    expect(result.deltaRevParCents).toBe(8500);
    expect(result.deltaRevParCents).toBeGreaterThanOrEqual(0);
  });

  it("teste de honestidade: cenário desfavorável reporta ΔRevPAR negativo, sem mascarar", () => {
    const nights = [
      makeNight({ fixedPriceCents: 20000, suggestedPriceCents: 10000, simulatedOccupiedAtFixedPrice: true, simulatedOccupiedAtSuggestedPrice: true }),
      makeNight({ fixedPriceCents: 20000, suggestedPriceCents: 10000, simulatedOccupiedAtFixedPrice: true, simulatedOccupiedAtSuggestedPrice: true }),
    ];

    const result = runBacktest(nights);

    expect(result.fixedRevParCents).toBe(20000);
    expect(result.suggestedRevParCents).toBe(10000);
    expect(result.deltaRevParCents).toBe(-10000);
  });

  it("lança EmptyBacktestHistoryError para histórico vazio", () => {
    expect(() => runBacktest([])).toThrow(EmptyBacktestHistoryError);
  });

  it("prova o portão de saída com um cenário maior e mais realista (30 noites, demanda mista)", () => {
    // 12 noites de baixa demanda: preço fixo (25000) alto demais para a temporada -> não ocupa;
    // preço sugerido com desconto (16000) enche o quarto.
    const lowDemandNights = Array.from({ length: 12 }, () =>
      makeNight({
        fixedPriceCents: 25000,
        suggestedPriceCents: 16000,
        simulatedOccupiedAtFixedPrice: false,
        simulatedOccupiedAtSuggestedPrice: true,
      }),
    );
    // 12 noites de alta demanda: o fixo já ocupa a 25000, mas a demanda sustenta um preço ainda
    // maior (30000) sem perder a ocupação.
    const highDemandNights = Array.from({ length: 12 }, () =>
      makeNight({
        fixedPriceCents: 25000,
        suggestedPriceCents: 30000,
        simulatedOccupiedAtFixedPrice: true,
        simulatedOccupiedAtSuggestedPrice: true,
      }),
    );
    // 6 noites neutras: sugerido igual ao fixo, mesma ocupação em ambos — contribuição de delta
    // zero, prova que o cenário não é "inflado" artificialmente em toda noite.
    const neutralNights = Array.from({ length: 6 }, () =>
      makeNight({
        fixedPriceCents: 20000,
        suggestedPriceCents: 20000,
        simulatedOccupiedAtFixedPrice: true,
        simulatedOccupiedAtSuggestedPrice: true,
      }),
    );
    const nights = [...lowDemandNights, ...highDemandNights, ...neutralNights];

    // Verificação cruzada independente da mesma definição de RevPAR (soma de receita realizada /
    // total de noites), calculada diretamente sobre os dados do cenário, sem depender de nenhuma
    // função interna do módulo sob teste.
    const expectedFixedRevenueCents = 12 * 0 + 12 * 25000 + 6 * 20000;
    const expectedSuggestedRevenueCents = 12 * 16000 + 12 * 30000 + 6 * 20000;

    const result = runBacktest(nights);

    expect(result.nightsCount).toBe(30);
    expect(result.fixedRevParCents).toBe(Math.round(expectedFixedRevenueCents / 30));
    expect(result.suggestedRevParCents).toBe(Math.round(expectedSuggestedRevenueCents / 30));
    expect(result.fixedRevParCents).toBe(14000);
    expect(result.suggestedRevParCents).toBe(22400);
    expect(result.deltaRevParCents).toBe(8400);
    expect(result.deltaRevParCents).toBeGreaterThanOrEqual(0);
  });

  it("preço 0 numa noite ocupada (ex.: promoção/erro de cadastro) contribui 0 à receita, sem quebrar o cálculo", () => {
    const nights = [
      makeNight({
        fixedPriceCents: 0,
        suggestedPriceCents: 20000,
        simulatedOccupiedAtFixedPrice: true,
        simulatedOccupiedAtSuggestedPrice: true,
      }),
      makeNight({
        fixedPriceCents: 20000,
        suggestedPriceCents: 20000,
        simulatedOccupiedAtFixedPrice: true,
        simulatedOccupiedAtSuggestedPrice: true,
      }),
    ];

    const result = runBacktest(nights);

    expect(result.fixedRevParCents).toBe(10000); // (0 + 20000) / 2 — a noite a preço 0 soma 0, não quebra a divisão
    expect(result.suggestedRevParCents).toBe(20000);
    expect(result.deltaRevParCents).toBe(10000);
  });

  it("com preço sugerido IGUAL ao fixo em todas as noites, o delta reflete só a diferença de ocupação", () => {
    // Mesmo preço nas duas colunas em toda noite — qualquer delta não-zero só pode vir da
    // ocupação simulada, nunca de uma diferença de preço nominal.
    const nights = [
      makeNight({
        fixedPriceCents: 20000,
        suggestedPriceCents: 20000,
        simulatedOccupiedAtFixedPrice: false,
        simulatedOccupiedAtSuggestedPrice: true,
      }),
      makeNight({
        fixedPriceCents: 20000,
        suggestedPriceCents: 20000,
        simulatedOccupiedAtFixedPrice: true,
        simulatedOccupiedAtSuggestedPrice: true,
      }),
    ];

    const result = runBacktest(nights);

    expect(result.fixedRevParCents).toBe(10000); // (0 + 20000) / 2
    expect(result.suggestedRevParCents).toBe(20000); // (20000 + 20000) / 2
    expect(result.deltaRevParCents).toBe(10000);
  });
});
