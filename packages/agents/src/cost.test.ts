import { describe, expect, it } from "vitest";
import { UnknownModelPriceError, computeConversationCostCents, resolveModelPriceRule, type ModelPriceRule } from "./cost";

const SAMPLE_RULE: ModelPriceRule = {
  modelName: "rule-based-v1",
  promptRateBasisPointsPerThousandTokens: 150, // R$ 0,0150 / 1k tokens
  completionRateBasisPointsPerThousandTokens: 600, // R$ 0,0600 / 1k tokens
};

describe("resolveModelPriceRule", () => {
  it("resolve a regra pelo nome do modelo", () => {
    expect(resolveModelPriceRule([SAMPLE_RULE], "rule-based-v1")).toBe(SAMPLE_RULE);
  });

  it("lança UnknownModelPriceError para modelo sem regra cadastrada", () => {
    expect(() => resolveModelPriceRule([SAMPLE_RULE], "modelo-desconhecido")).toThrow(UnknownModelPriceError);
  });
});

describe("computeConversationCostCents", () => {
  it("calcula o custo somando prompt + completion, cada um arredondado independentemente", () => {
    const cost = computeConversationCostCents({ promptTokens: 2000, completionTokens: 500 }, SAMPLE_RULE);
    // prompt: (2000/1000) * 150 = 300; completion: (500/1000) * 600 = 300 -> total 600
    expect(cost).toBe(600);
  });

  it("produz custo > 0 para qualquer uso positivo — prova que o custo por conversa é medido", () => {
    const cost = computeConversationCostCents({ promptTokens: 50, completionTokens: 20 }, SAMPLE_RULE);
    expect(cost).toBeGreaterThan(0);
  });

  it("produz custo 0 para uso zero, nunca negativo", () => {
    const cost = computeConversationCostCents({ promptTokens: 0, completionTokens: 0 }, SAMPLE_RULE);
    expect(cost).toBe(0);
  });
});
