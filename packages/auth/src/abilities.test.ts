import { describe, expect, it } from "vitest";
import { defineAbilityFor } from "./abilities";

describe("CASL abilities — regras absolutas da Fase 0", () => {
  it("I10: NENHUM papel pode excluir evidência, nem o owner", () => {
    const roles = [
      "titan.owner",
      "titan.finance",
      "titan.auditor",
      "titan.agent",
      "owner",
      "vendor",
      "guest",
    ] as const;

    for (const role of roles) {
      const ability = defineAbilityFor(role);
      expect(ability.can("delete", "evidence")).toBe(false);
    }
  });

  it("titan.agent nunca executa — só propõe", () => {
    const ability = defineAbilityFor("titan.agent");
    expect(ability.can("propose", "payout_batch")).toBe(true);
    expect(ability.can("approve", "payout_batch")).toBe(false);
    expect(ability.can("create", "all")).toBe(false);
  });

  it("titan.revenue não acessa payout_batch (sem escopo bancário)", () => {
    const ability = defineAbilityFor("titan.revenue");
    expect(ability.can("read", "payout_batch")).toBe(false);
  });

  it("titan.finance não altera tarifa", () => {
    const ability = defineAbilityFor("titan.finance");
    expect(ability.can("update", "rate")).toBe(false);
  });

  it("titan.auditor só lê, nunca escreve", () => {
    const ability = defineAbilityFor("titan.auditor");
    expect(ability.can("read", "all")).toBe(true);
    expect(ability.can("update", "ledger")).toBe(false);
  });
});
