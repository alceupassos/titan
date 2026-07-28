import { describe, expect, it } from "vitest";
import { EmptyGoldenSetError, runGoldenSet, type GoldenSetCase } from "./golden-set";
import { RuleBasedModelProvider } from "./model-provider";

// 20 casos cobrindo as 6 intenções conhecidas + 1 caso propositalmente ambíguo ("unknown") —
// mesmo espírito de cobertura de casos de borda já usado nos golden-sets de outras fases (ex.
// cenário de 30 noites do backtest da Fase 8): casos suficientes para a acurácia ser um número
// que significa algo, não 2-3 casos fáceis de acertar por acidente.
const CONCIERGE_GOLDEN_SET: GoldenSetCase[] = [
  { id: "g1", userMessage: "Oi, tudo bem?", expectedIntent: "greeting" },
  { id: "g2", userMessage: "Bom dia!", expectedIntent: "greeting" },
  { id: "g3", userMessage: "Boa noite, chegando agora", expectedIntent: "greeting" },
  { id: "g4", userMessage: "Qual a senha do wifi?", expectedIntent: "wifi_password" },
  { id: "g5", userMessage: "Não consigo achar a senha do wi-fi", expectedIntent: "wifi_password" },
  { id: "g6", userMessage: "Que horas é o check-in?", expectedIntent: "check_in_info" },
  { id: "g7", userMessage: "Queria saber a que horas chego, pode ser antes?", expectedIntent: "check_in_info" },
  { id: "g8", userMessage: "Que horas é o checkout?", expectedIntent: "checkout_time" },
  { id: "g9", userMessage: "Preciso saber que horas saio amanhã", expectedIntent: "checkout_time" },
  { id: "g10", userMessage: "A piscina está aberta?", expectedIntent: "amenity_question" },
  { id: "g11", userMessage: "Tem estacionamento no prédio?", expectedIntent: "amenity_question" },
  { id: "g12", userMessage: "O ar condicionado do quarto não liga", expectedIntent: "amenity_question" },
  { id: "g13", userMessage: "Socorro, tem um vazamento no banheiro!", expectedIntent: "urgent_issue" },
  { id: "g14", userMessage: "Isso é urgente, preciso de ajuda agora", expectedIntent: "urgent_issue" },
  { id: "g15", userMessage: "Emergência, cheiro de fumaça no corredor", expectedIntent: "urgent_issue" },
  { id: "g16", userMessage: "Olá", expectedIntent: "greeting" },
  { id: "g17", userMessage: "Qual o horário de check-out mesmo?", expectedIntent: "checkout_time" },
  { id: "g18", userMessage: "Academia funciona até que horas?", expectedIntent: "amenity_question" },
  { id: "g19", userMessage: "asdkj qwoiej 12903", expectedIntent: "unknown" },
  { id: "g20", userMessage: "xyzzy plugh", expectedIntent: "unknown" },
];

const TARGET_ACCURACY_PERCENT = 90; // alvo desta versão do Concierge (v0.1, heurística de regras)

describe("runGoldenSet — portão de saída: acurácia do golden-set ≥ alvo", () => {
  it("RuleBasedModelProvider atinge o alvo de acurácia sobre o golden-set do Concierge", async () => {
    const provider = new RuleBasedModelProvider();
    const result = await runGoldenSet(CONCIERGE_GOLDEN_SET, provider, TARGET_ACCURACY_PERCENT);

    expect(result.accuracyPercent).toBeGreaterThanOrEqual(TARGET_ACCURACY_PERCENT);
    expect(result.meetsTarget).toBe(true);
    expect(result.caseResults).toHaveLength(CONCIERGE_GOLDEN_SET.length);
  });

  it("reporta meetsTarget=false quando o alvo é inatingível, sem mascarar o resultado real", async () => {
    const provider = new RuleBasedModelProvider();
    const result = await runGoldenSet(CONCIERGE_GOLDEN_SET, provider, 101);
    expect(result.meetsTarget).toBe(false);
    // A acurácia real continua reportada, nunca forçada a bater com o alvo impossível.
    expect(result.accuracyPercent).toBeLessThan(101);
  });

  it("lança EmptyGoldenSetError para golden-set vazio", async () => {
    const provider = new RuleBasedModelProvider();
    await expect(runGoldenSet([], provider, 90)).rejects.toThrow(EmptyGoldenSetError);
  });
});
