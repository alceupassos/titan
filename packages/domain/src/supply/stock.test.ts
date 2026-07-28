import { describe, expect, it } from "vitest";
import {
  InvalidReplenishmentInputError,
  NonPositiveQuantityError,
  computeReorderPoint,
  reconstructStockLevel,
  shouldTriggerReplenishment,
  type StockMovement,
} from "./stock";

function movement(overrides: Partial<StockMovement> = {}): StockMovement {
  return {
    unitId: "unit-1",
    itemType: "toalha_banho",
    type: "purchase",
    quantity: 1,
    ...overrides,
  };
}

describe("reconstructStockLevel", () => {
  it("reconstrói o saldo a partir de um cenário misto com os 5 tipos de movimento", () => {
    const movements: StockMovement[] = [
      movement({ type: "purchase", quantity: 100 }),
      movement({ type: "consumption", quantity: 30 }),
      movement({ type: "adjustment", quantity: 5 }), // contagem física encontrou 5 a mais
      movement({ type: "loss", quantity: 3 }),
      movement({ type: "return", quantity: 10 }),
    ];
    // 100 (purchase) - 30 (consumption) + 5 (adjustment) - 3 (loss) + 10 (return) = 82
    expect(reconstructStockLevel(movements)).toBe(82);
  });

  it("retorna 0 para histórico vazio", () => {
    expect(reconstructStockLevel([])).toBe(0);
  });

  it("lança NonPositiveQuantityError quando algum movimento tem quantity == 0", () => {
    expect(() => reconstructStockLevel([movement({ quantity: 0 })])).toThrow(
      NonPositiveQuantityError,
    );
  });

  it("lança NonPositiveQuantityError quando algum movimento tem quantity negativo", () => {
    expect(() => reconstructStockLevel([movement({ quantity: -1 })])).toThrow(
      NonPositiveQuantityError,
    );
  });
});

describe("computeReorderPoint", () => {
  it("calcula o ponto de reposição arredondando para cima", () => {
    expect(
      computeReorderPoint({ avgDailyConsumption: 2.5, leadTimeDays: 3, safetyStockDays: 2 }),
    ).toBe(Math.ceil(2.5 * 5));
  });

  it("aceita zero em qualquer campo (fronteira válida)", () => {
    expect(
      computeReorderPoint({ avgDailyConsumption: 0, leadTimeDays: 0, safetyStockDays: 0 }),
    ).toBe(0);
  });

  it("lança InvalidReplenishmentInputError quando avgDailyConsumption é negativo", () => {
    expect(() =>
      computeReorderPoint({ avgDailyConsumption: -1, leadTimeDays: 3, safetyStockDays: 2 }),
    ).toThrow(InvalidReplenishmentInputError);
  });

  it("lança InvalidReplenishmentInputError quando leadTimeDays é negativo", () => {
    expect(() =>
      computeReorderPoint({ avgDailyConsumption: 1, leadTimeDays: -1, safetyStockDays: 2 }),
    ).toThrow(InvalidReplenishmentInputError);
  });

  it("lança InvalidReplenishmentInputError quando safetyStockDays é negativo", () => {
    expect(() =>
      computeReorderPoint({ avgDailyConsumption: 1, leadTimeDays: 3, safetyStockDays: -1 }),
    ).toThrow(InvalidReplenishmentInputError);
  });
});

describe("shouldTriggerReplenishment", () => {
  it("dispara quando o saldo atual está exatamente no ponto de reposição", () => {
    expect(shouldTriggerReplenishment(10, 10)).toBe(true);
  });

  it("dispara quando o saldo atual está abaixo do ponto de reposição", () => {
    expect(shouldTriggerReplenishment(9, 10)).toBe(true);
  });

  it("não dispara quando o saldo atual está acima do ponto de reposição", () => {
    expect(shouldTriggerReplenishment(11, 10)).toBe(false);
  });
});
