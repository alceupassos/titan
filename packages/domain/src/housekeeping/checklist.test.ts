import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import {
  BlockingItemUnansweredError,
  computeChecklistScore,
  type ChecklistItemResponse,
  type ChecklistTemplate,
} from "./checklist";

function makeTemplate(overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate {
  return {
    id: "template-1",
    version: 1,
    serviceType: "limpeza_saida",
    passingScore: 80,
    validFrom: civilDate("2026-01-01"),
    validTo: civilDate("2026-12-31"),
    sections: [
      {
        id: "sec-banheiro",
        title: "Banheiro",
        items: [
          { id: "item-vaso", label: "Vaso sanitário limpo", weight: 10, blocking: true, type: "photo" },
          { id: "item-enxoval", label: "Enxoval trocado", weight: 5, blocking: false, type: "confirm" },
        ],
      },
      {
        id: "sec-cozinha",
        title: "Cozinha",
        items: [{ id: "item-geladeira", label: "Geladeira limpa", weight: 5, blocking: false, type: "photo" }],
      },
    ],
    ...overrides,
  };
}

describe("computeChecklistScore", () => {
  it("pondera corretamente com pesos diferentes", () => {
    const template = makeTemplate();
    const responses: ChecklistItemResponse[] = [
      { itemId: "item-vaso", answered: true, passed: true }, // weight 10
      { itemId: "item-enxoval", answered: true, passed: true }, // weight 5
      { itemId: "item-geladeira", answered: true, passed: false }, // weight 5, não conta
    ];
    const result = computeChecklistScore(template, responses);
    // total weight = 20, earned = 15 -> 75%
    expect(result.scorePercent).toBe(75);
    expect(result.passed).toBe(false); // 75 < passingScore (80)
  });

  it("lança BlockingItemUnansweredError quando um item bloqueante não tem resposta", () => {
    const template = makeTemplate();
    const responses: ChecklistItemResponse[] = [
      { itemId: "item-enxoval", answered: true, passed: true },
      { itemId: "item-geladeira", answered: true, passed: true },
      // item-vaso (blocking) ausente
    ];
    expect(() => computeChecklistScore(template, responses)).toThrow(BlockingItemUnansweredError);
  });

  it("lança BlockingItemUnansweredError quando o item bloqueante está presente mas answered:false", () => {
    const template = makeTemplate();
    const responses: ChecklistItemResponse[] = [
      { itemId: "item-vaso", answered: false },
      { itemId: "item-enxoval", answered: true, passed: true },
      { itemId: "item-geladeira", answered: true, passed: true },
    ];
    expect(() => computeChecklistScore(template, responses)).toThrow(BlockingItemUnansweredError);
  });

  it("item bloqueante respondido mas reprovado reprova o checklist mesmo com score alto nos demais", () => {
    const template = makeTemplate({ passingScore: 50 });
    const responses: ChecklistItemResponse[] = [
      { itemId: "item-vaso", answered: true, passed: false }, // blocking, reprovado
      { itemId: "item-enxoval", answered: true, passed: true },
      { itemId: "item-geladeira", answered: true, passed: true },
    ];
    const result = computeChecklistScore(template, responses);
    // total weight = 20, earned = 10 (enxoval+geladeira) -> 50%, >= passingScore (50)
    expect(result.scorePercent).toBe(50);
    expect(result.passed).toBe(false); // ainda reprovado por causa do item bloqueante
  });

  it("aprova quando o score atinge o mínimo e nenhum bloqueante falhou", () => {
    const template = makeTemplate({ passingScore: 80 });
    const responses: ChecklistItemResponse[] = [
      { itemId: "item-vaso", answered: true, passed: true },
      { itemId: "item-enxoval", answered: true, passed: true },
      { itemId: "item-geladeira", answered: true, passed: true },
    ];
    const result = computeChecklistScore(template, responses);
    expect(result.scorePercent).toBe(100);
    expect(result.passed).toBe(true);
  });
});
