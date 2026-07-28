// Golden-set (portão de saída da Fase 10: "acurácia do golden-set ≥ alvo") — conjunto de casos
// versionado, rodado contra um `AgentModelProvider` real, medindo acurácia de classificação de
// intenção. Redução de escopo: sem CI real configurado para rodar isto a cada mudança de prompt
// (mesma ressalva de todas as fases anteriores) — a prova nesta sessão é um teste Vitest
// determinístico (mesmo padrão de `runBacktest`/`pipeline-integration.test.ts` da Fase 8).
import type { AgentIntent, AgentModelProvider, AgentMessage } from "./model-provider";

export interface GoldenSetCase {
  readonly id: string;
  readonly userMessage: string;
  readonly expectedIntent: AgentIntent;
}

export interface GoldenSetCaseResult {
  readonly caseId: string;
  readonly expectedIntent: AgentIntent;
  readonly actualIntent: AgentIntent;
  readonly correct: boolean;
}

export interface GoldenSetResult {
  readonly caseResults: readonly GoldenSetCaseResult[];
  readonly accuracyPercent: number;
  /** Nunca ajustado para "parecer bom" — mesma disciplina de `.claude/agents/pricing-scientist.md`
   * aplicada aqui: reporta a acurácia real, mesmo que abaixo do alvo. */
  readonly meetsTarget: boolean;
}

export class EmptyGoldenSetError extends Error {
  constructor() {
    super("Golden-set vazio — não é possível medir acurácia sem nenhum caso.");
    this.name = "EmptyGoldenSetError";
  }
}

/**
 * Roda cada caso do golden-set contra o `provider` fornecido e mede acurácia de classificação de
 * intenção. `targetAccuracyPercent` é parâmetro explícito do chamador (nunca um número mágico
 * fixo neste arquivo) — o alvo real depende do agente/versão de prompt, versionável como
 * qualquer outro dado de negócio.
 */
export async function runGoldenSet(
  cases: readonly GoldenSetCase[],
  provider: AgentModelProvider,
  targetAccuracyPercent: number,
): Promise<GoldenSetResult> {
  if (cases.length === 0) {
    throw new EmptyGoldenSetError();
  }

  const caseResults: GoldenSetCaseResult[] = [];
  for (const testCase of cases) {
    const messages: AgentMessage[] = [{ role: "user", content: testCase.userMessage, trusted: true }];
    const completion = await provider.complete(messages);
    caseResults.push({
      caseId: testCase.id,
      expectedIntent: testCase.expectedIntent,
      actualIntent: completion.intent,
      correct: completion.intent === testCase.expectedIntent,
    });
  }

  const correctCount = caseResults.filter((r) => r.correct).length;
  const accuracyPercent = Math.round((correctCount / caseResults.length) * 10000) / 100;

  return {
    caseResults,
    accuracyPercent,
    meetsTarget: accuracyPercent >= targetAccuracyPercent,
  };
}
