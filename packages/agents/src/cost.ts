// Custo por conversa (portão de saída da Fase 10: "custo por conversa medido") — tabela
// versionada de preço por modelo/token, mesma disciplina de `VendorRetentionRule`/`TaxRule`:
// nunca uma constante numérica solta, nunca float (basis points de centavo por 1.000 tokens).
// Valores de EXEMPLO — pendentes de confirmação antes de produção real, mesma ressalva já usada
// para toda tabela fiscal desde a Fase 4 (sem provedor de LLM real configurado nesta sessão para
// confirmar o preço vigente).
import type { Cents } from "@titan/domain";
import type { TokenUsage } from "./model-provider";

export interface ModelPriceRule {
  readonly modelName: string;
  /** Preço em basis points de CENTAVO por 1.000 tokens de prompt — ex. 150 = R$ 0,0150 / 1k
   * tokens. Nunca float; ver docs/anti-padroes.md #9. */
  readonly promptRateBasisPointsPerThousandTokens: number;
  readonly completionRateBasisPointsPerThousandTokens: number;
}

export class UnknownModelPriceError extends Error {
  constructor(modelName: string) {
    super(`Nenhuma ModelPriceRule cadastrada para o modelo "${modelName}" — nunca cobra preço zero silenciosamente.`);
    this.name = "UnknownModelPriceError";
  }
}

export function resolveModelPriceRule(
  rules: readonly ModelPriceRule[],
  modelName: string,
): ModelPriceRule {
  const rule = rules.find((r) => r.modelName === modelName);
  if (!rule) {
    throw new UnknownModelPriceError(modelName);
  }
  return rule;
}

/**
 * Custo da conversa em Cents — soma dos custos de prompt e completion, cada um calculado
 * independentemente e arredondado por `Math.round` (mesmo padrão de arredondamento composto já
 * usado em `calculateVendorRetentionAmountsCents`: cada parcela arredonda por conta própria, sem
 * "conta de fechamento" aqui porque não há um total externo pré-definido para bater contra —
 * diferente de retenção, o custo total NASCE da soma das partes).
 */
export function computeConversationCostCents(usage: TokenUsage, rule: ModelPriceRule): Cents {
  const promptCostCents = Math.round(
    (usage.promptTokens / 1000) * rule.promptRateBasisPointsPerThousandTokens,
  );
  const completionCostCents = Math.round(
    (usage.completionTokens / 1000) * rule.completionRateBasisPointsPerThousandTokens,
  );
  return promptCostCents + completionCostCents;
}
