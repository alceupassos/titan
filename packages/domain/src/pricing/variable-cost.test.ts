import { describe, expect, it } from "vitest";
import {
  NegativeVariableCostComponentError,
  computeVariableCostFloorCents,
  type VariableCostInputs,
} from "./variable-cost";

function makeInputs(overrides: Partial<VariableCostInputs> = {}): VariableCostInputs {
  return {
    cleaningCostCents: 8000,
    linenReplenishmentCostCents: 1500,
    channelCommissionBasisPoints: 1500, // 15%
    gatewayRateBasisPoints: 300, // 3%
    ...overrides,
  };
}

describe("computeVariableCostFloorCents", () => {
  it("soma limpeza + enxoval + comissão + taxa de gateway proporcionais + margem mínima", () => {
    const inputs = makeInputs();
    const expectedRevenueCents = 30000; // R$ 300,00
    const floor = computeVariableCostFloorCents(inputs, expectedRevenueCents, 1000); // 10% margem

    const commission = Math.round((expectedRevenueCents * 1500) / 10000); // 4500
    const gateway = Math.round((expectedRevenueCents * 300) / 10000); // 900
    const totalVariableCost = 8000 + 1500 + commission + gateway; // 14900
    const margin = Math.round((totalVariableCost * 1000) / 10000);

    expect(floor).toBe(totalVariableCost + margin);
  });

  it("aceita comissão/taxa de gateway zeradas (dívida técnica de fases anteriores) sem fingir um valor realista", () => {
    const inputs = makeInputs({ channelCommissionBasisPoints: 0, gatewayRateBasisPoints: 0 });
    const floor = computeVariableCostFloorCents(inputs, 30000, 0);
    expect(floor).toBe(inputs.cleaningCostCents + inputs.linenReplenishmentCostCents);
  });

  it("lança NegativeVariableCostComponentError para qualquer componente negativo", () => {
    expect(() => computeVariableCostFloorCents(makeInputs({ cleaningCostCents: -1 }), 30000, 0)).toThrow(
      NegativeVariableCostComponentError,
    );
    expect(() => computeVariableCostFloorCents(makeInputs(), -1, 0)).toThrow(
      NegativeVariableCostComponentError,
    );
  });

  it("piso nunca é negativo quando todos os componentes são zero", () => {
    const inputs = makeInputs({
      cleaningCostCents: 0,
      linenReplenishmentCostCents: 0,
      channelCommissionBasisPoints: 0,
      gatewayRateBasisPoints: 0,
    });
    expect(computeVariableCostFloorCents(inputs, 0, 0)).toBe(0);
  });
});
