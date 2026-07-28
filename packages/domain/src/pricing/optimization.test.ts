import { describe, expect, it } from "vitest";
import type { Cents } from "../ledger/ledger-entry";
import { InvalidPriceRangeError, InvalidStepError, optimizeNightlyPriceCents } from "./optimization";

describe("optimizeNightlyPriceCents", () => {
  it("encontra o preço que maximiza receita esperada dentro da faixa", () => {
    // Demanda decai linearmente: probabilidade 1.0 em 10000, caindo 0.1 a cada 5000 centavos.
    const occupancyProbabilityAtPrice = (priceCents: Cents) => {
      const stepsAboveFloor = (priceCents - 10000) / 5000;
      return Math.max(0, 1 - stepsAboveFloor * 0.1);
    };

    const result = optimizeNightlyPriceCents({
      floorCents: 10000,
      ceilingCents: 40000,
      occupancyProbabilityAtPrice,
      stepCents: 5000,
    });

    // Receita esperada: 10000*1.0=10000; 15000*0.9=13500; 20000*0.8=16000; 25000*0.7=17500;
    // 30000*0.6=18000; 35000*0.5=17500; 40000*0.4=16000 -> máximo em 30000.
    expect(result.suggestedCents).toBe(30000);
    expect(result.expectedRevenueCents).toBe(18000);
  });

  it("nunca sugere preço abaixo do floor", () => {
    const result = optimizeNightlyPriceCents({
      floorCents: 20000,
      ceilingCents: 20000,
      occupancyProbabilityAtPrice: () => 1,
      stepCents: 1000,
    });
    expect(result.suggestedCents).toBe(20000);
  });

  it("floor === ceiling (faixa de um único ponto): laço não avalia nenhum outro candidato", () => {
    const occupancyProbabilityAtPrice = (priceCents: Cents) => {
      // Se o laço avaliasse qualquer preço além do floor, essa função lançaria — prova que
      // nenhum outro ponto é avaliado.
      if (priceCents !== 15000) {
        throw new Error(`avaliou um preço inesperado: ${priceCents}`);
      }
      return 0.5;
    };

    const result = optimizeNightlyPriceCents({
      floorCents: 15000,
      ceilingCents: 15000,
      occupancyProbabilityAtPrice,
      stepCents: 1000,
    });

    expect(result.suggestedCents).toBe(15000);
    expect(result.expectedRevenueCents).toBe(7500);
  });

  it("stepCents maior que (ceiling - floor): grade tem só o ponto inicial (floor)", () => {
    const occupancyProbabilityAtPrice = (priceCents: Cents) => {
      if (priceCents !== 10000) {
        throw new Error(`avaliou um preço inesperado: ${priceCents}`);
      }
      return 1;
    };

    const result = optimizeNightlyPriceCents({
      floorCents: 10000,
      ceilingCents: 15000,
      occupancyProbabilityAtPrice,
      // floorCents + stepCents = 30000 > ceilingCents (15000) -> nenhuma iteração do laço.
      stepCents: 20000,
    });

    expect(result.suggestedCents).toBe(10000);
    expect(result.expectedRevenueCents).toBe(10000);
  });

  it("occupancyProbabilityAtPrice retorna 0 em toda a faixa: receita esperada zero, escolhe o menor preço", () => {
    const result = optimizeNightlyPriceCents({
      floorCents: 10000,
      ceilingCents: 30000,
      occupancyProbabilityAtPrice: () => 0,
      stepCents: 5000,
    });

    expect(result.expectedRevenueCents).toBe(0);
    expect(result.suggestedCents).toBe(10000);
  });

  it("occupancyProbabilityAtPrice retorna valores negativos: propaga o cálculo sem lançar erro", () => {
    // Decisão de design (ver comentário em optimization.ts): a função nunca valida/clampa o
    // retorno do chamador. Com probabilidade negativa constante, a receita esperada fica mais
    // negativa quanto maior o preço — o floor vence porque é o "menos negativo", pela mesma
    // aritmética da grade, não por um caso especial para negativos.
    const result = optimizeNightlyPriceCents({
      floorCents: 10000,
      ceilingCents: 30000,
      occupancyProbabilityAtPrice: () => -0.5,
      stepCents: 10000,
    });

    expect(result.suggestedCents).toBe(10000);
    expect(result.expectedRevenueCents).toBe(-5000);
  });

  it("stepCents não divide exatamente (ceiling - floor): grade nunca ultrapassa o ceiling", () => {
    // floor=10000, step=7000 -> candidatos 10000, 17000, 24000 (31000 > 25000 = ceiling, para).
    // Probabilidade constante em 1 faz a receita crescer com o preço, então o maior candidato
    // avaliado (24000) vence — prova que o ceiling (25000) nunca é avaliado nem ultrapassado.
    const result = optimizeNightlyPriceCents({
      floorCents: 10000,
      ceilingCents: 25000,
      occupancyProbabilityAtPrice: () => 1,
      stepCents: 7000,
    });

    expect(result.suggestedCents).toBe(24000);
    expect(result.expectedRevenueCents).toBe(24000);
  });

  it("em empate de receita esperada, prefere o preço menor", () => {
    const result = optimizeNightlyPriceCents({
      floorCents: 10000,
      ceilingCents: 20000,
      occupancyProbabilityAtPrice: (priceCents) => (priceCents === 10000 ? 1 : 0.5),
      stepCents: 10000,
    });
    // 10000*1=10000; 20000*0.5=10000 -> empate, prefere o menor (10000).
    expect(result.suggestedCents).toBe(10000);
  });

  it("lança InvalidPriceRangeError quando floor > ceiling", () => {
    expect(() =>
      optimizeNightlyPriceCents({
        floorCents: 30000,
        ceilingCents: 10000,
        occupancyProbabilityAtPrice: () => 1,
        stepCents: 1000,
      }),
    ).toThrow(InvalidPriceRangeError);
  });

  it("lança InvalidStepError para stepCents não positivo", () => {
    expect(() =>
      optimizeNightlyPriceCents({
        floorCents: 10000,
        ceilingCents: 20000,
        occupancyProbabilityAtPrice: () => 1,
        stepCents: 0,
      }),
    ).toThrow(InvalidStepError);
  });
});
