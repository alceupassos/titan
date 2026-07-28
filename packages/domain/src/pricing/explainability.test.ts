import { describe, expect, it } from "vitest";
import { explainPriceDecision, type PriceExplanationInputs } from "./explainability";

function makeInputs(overrides: Partial<PriceExplanationInputs> = {}): PriceExplanationInputs {
  return {
    compSet: [{ unitId: "u1", similarityScore: 0.9 }],
    compSetMedianPriceCents: 20000,
    floorCents: 15000,
    seasonalityFactor: 1,
    finalPriceCents: 22000,
    ...overrides,
  };
}

describe("explainPriceDecision", () => {
  it("produz reasoning não vazio para uma noite com comp set e sazonalidade neutra", () => {
    const explanation = explainPriceDecision(makeInputs());
    expect(explanation.reasoning.length).toBeGreaterThan(0);
    expect(explanation.compSetSize).toBe(1);
    expect(explanation.finalPriceCents).toBe(22000);
  });

  it("produz reasoning não vazio mesmo sem comp set (âncora só no piso + sazonalidade)", () => {
    const explanation = explainPriceDecision(makeInputs({ compSet: [], compSetMedianPriceCents: null }));
    expect(explanation.reasoning.length).toBeGreaterThan(0);
    expect(explanation.compSetSize).toBe(0);
    expect(explanation.compSetMedianPriceCents).toBeNull();
  });

  it("menciona sazonalidade acima da média quando o fator é > 1", () => {
    const explanation = explainPriceDecision(makeInputs({ seasonalityFactor: 1.5 }));
    expect(explanation.reasoning.some((line) => line.includes("acima da média"))).toBe(true);
  });

  it("menciona sazonalidade abaixo da média quando o fator é < 1", () => {
    const explanation = explainPriceDecision(makeInputs({ seasonalityFactor: 0.7 }));
    expect(explanation.reasoning.some((line) => line.includes("abaixo da média"))).toBe(true);
  });

  it("sinaliza explicitamente quando o preço final é igual ao piso", () => {
    const explanation = explainPriceDecision(makeInputs({ finalPriceCents: 15000, floorCents: 15000 }));
    expect(explanation.reasoning.some((line) => line.includes("igual ao piso"))).toBe(true);
  });

  it("nunca produz reasoning vazio, para nenhuma combinação de inputs válidos (extremos incluídos)", () => {
    // Portão de saída: "explicação disponível por noite" — testa o produto cartesiano de casos
    // extremos (comp set vazio/preenchido, sazonalidade nos 3 ramos, preço final igual/diferente
    // do piso) para garantir que nenhuma combinação escapa sem nenhuma frase de explicação.
    const compSetVariants: Array<Pick<PriceExplanationInputs, "compSet" | "compSetMedianPriceCents">> = [
      { compSet: [], compSetMedianPriceCents: null },
      { compSet: [{ unitId: "u1", similarityScore: 0.9 }], compSetMedianPriceCents: 20000 },
    ];
    const seasonalityVariants = [1, 1.5, 0.7];
    const floorCents = 15000;
    const finalPriceVariants = [floorCents, floorCents + 7000];

    for (const compSetVariant of compSetVariants) {
      for (const seasonalityFactor of seasonalityVariants) {
        for (const finalPriceCents of finalPriceVariants) {
          const explanation = explainPriceDecision(
            makeInputs({ ...compSetVariant, seasonalityFactor, floorCents, finalPriceCents }),
          );
          expect(explanation.reasoning.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("compSetMedianPriceCents zero ou negativo não faz format(money(...)) lançar", () => {
    expect(() => explainPriceDecision(makeInputs({ compSetMedianPriceCents: 0 }))).not.toThrow();
    expect(() => explainPriceDecision(makeInputs({ compSetMedianPriceCents: -500 }))).not.toThrow();

    const zeroExplanation = explainPriceDecision(makeInputs({ compSetMedianPriceCents: 0 }));
    expect(zeroExplanation.reasoning.length).toBeGreaterThan(0);
    expect(zeroExplanation.compSetMedianPriceCents).toBe(0);

    const negativeExplanation = explainPriceDecision(makeInputs({ compSetMedianPriceCents: -500 }));
    expect(negativeExplanation.reasoning.length).toBeGreaterThan(0);
    expect(negativeExplanation.compSetMedianPriceCents).toBe(-500);
  });
});
