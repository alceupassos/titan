import { AbilityBuilder, createMongoAbility } from "@casl/ability";
import { describe, expect, it } from "vitest";
import { defineAbilityFor, type AppAbility } from "./abilities";

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

  it("titan.finance decide sobre documento fiscal — reprocessar (update) e cancelar (approve)", () => {
    // Fase 4, Passo 4c: reprocessar já usava "update" (concedido junto de "ledger" desde antes
    // deste passo); "approve" é o único verbo novo, para o cancelamento (mais consequente — I7).
    const ability = defineAbilityFor("titan.finance");
    expect(ability.can("update", "fiscal_document")).toBe(true);
    expect(ability.can("approve", "fiscal_document")).toBe(true);
  });

  it("titan.auditor só lê, nunca escreve", () => {
    const ability = defineAbilityFor("titan.auditor");
    expect(ability.can("read", "all")).toBe(true);
    expect(ability.can("update", "ledger")).toBe(false);
  });

  it("I10 sobrevive mesmo se um papel futuro conceder delete sobre 'all' (achado F-2/FALHA-D)", () => {
    // Reproduz a mecânica do CASL isoladamente: regra mais recente vence. Prova que a ORDEM
    // (guarda por último, não por primeiro) é o que realmente sustenta I10 — não o fato de que
    // nenhum papel hoje pede "delete". Um probe real com o @casl/ability instalado confirmou
    // que a ordem antiga (guarda primeiro) deixava `can("delete","all")` de um papel futuro
    // revogar a proteção em silêncio, com a suíte inteira continuando verde.
    function buildWithGuardFirst(): AppAbility {
      const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
      cannot("delete", "evidence").because("I10");
      can("delete", "all"); // papel fictício futuro, hipotético
      return build();
    }

    function buildWithGuardLast(): AppAbility {
      const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
      can("delete", "all"); // mesmo papel fictício futuro
      cannot("delete", "evidence").because("I10");
      return build();
    }

    // Documenta o bug que a ordem antiga tinha: guarda primeiro é revogável.
    expect(buildWithGuardFirst().can("delete", "evidence")).toBe(true);
    // A ordem real usada em defineAbilityFor (guarda por último) sobrevive.
    expect(buildWithGuardLast().can("delete", "evidence")).toBe(false);
  });
});
