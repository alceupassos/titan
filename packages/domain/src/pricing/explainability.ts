// Portão de saída da Fase 8 (docs/roadmap.md): "explicação disponível por noite" (seção 9.7:
// "contribuição de cada fator, comparáveis usados, ocupação do comp set, evento detectado").
// Redução de escopo: sem `MarketDataProvider` real (feriado/clima/evento — ADR-0014, níveis 2-4),
// a explicação cobre só os fatores que esta fase de fato calcula: comp set, piso de custo
// variável, sazonalidade. Zero I/O: monta a explicação a partir dos outputs já calculados pelos
// outros módulos deste pacote, nunca recalcula nada por conta própria.
import { format, money } from "@titan/money";
import type { Cents } from "../ledger/ledger-entry";
import type { CompSetMember } from "./comp-set";

/** BRL fixo — a moeda de exibição desta explicação é sempre a do próprio pacote de domínio de
 * pricing (BRL, hospedagem doméstica); se a Fase 2 (multi-moeda de checkout) precisar de outra
 * moeda aqui, o chamador passa a moeda como parte de `PriceExplanationInputs` — fora de escopo
 * desta fase. */
const DISPLAY_CURRENCY = "BRL" as const;

export interface PriceExplanationInputs {
  readonly compSet: readonly CompSetMember[];
  readonly compSetMedianPriceCents: Cents | null;
  readonly floorCents: Cents;
  readonly seasonalityFactor: number;
  readonly finalPriceCents: Cents;
}

export interface PriceExplanation {
  readonly finalPriceCents: Cents;
  readonly compSetSize: number;
  readonly compSetMedianPriceCents: Cents | null;
  readonly floorCents: Cents;
  readonly seasonalityFactor: number;
  /** Frases prontas em pt-BR, uma por fator relevante — o que o cockpit exibe diretamente no
   * painel de explicabilidade por noite, sem o front precisar montar texto a partir de números
   * soltos. */
  readonly reasoning: readonly string[];
}

/**
 * Monta a explicação de uma noite a partir dos outputs já calculados pelos outros módulos
 * (comp-set/variable-cost/forecast/optimization) — nunca inventa um fator que não foi
 * efetivamente usado no cálculo do preço final.
 */
export function explainPriceDecision(inputs: PriceExplanationInputs): PriceExplanation {
  const reasoning: string[] = [];

  if (inputs.compSet.length === 0) {
    reasoning.push("Sem comparáveis suficientes no comp set — preço apoiado só no piso de custo e na sazonalidade.");
  } else {
    reasoning.push(
      `Comp set com ${inputs.compSet.length} unidade(s) comparável(is)` +
        (inputs.compSetMedianPriceCents !== null
          ? `, mediana de ${format(money(inputs.compSetMedianPriceCents, DISPLAY_CURRENCY))}.`
          : "."),
    );
  }

  reasoning.push(`Piso de custo variável: ${format(money(inputs.floorCents, DISPLAY_CURRENCY))} por diária.`);

  if (inputs.seasonalityFactor > 1) {
    reasoning.push(
      `Sazonalidade acima da média para este dia da semana (fator ${inputs.seasonalityFactor.toFixed(2)}).`,
    );
  } else if (inputs.seasonalityFactor < 1) {
    reasoning.push(
      `Sazonalidade abaixo da média para este dia da semana (fator ${inputs.seasonalityFactor.toFixed(2)}).`,
    );
  } else {
    reasoning.push("Sazonalidade neutra para este dia da semana.");
  }

  if (inputs.finalPriceCents === inputs.floorCents) {
    reasoning.push("Preço final igual ao piso — a demanda prevista não sustenta preço acima do custo variável + margem.");
  }

  return {
    finalPriceCents: inputs.finalPriceCents,
    compSetSize: inputs.compSet.length,
    compSetMedianPriceCents: inputs.compSetMedianPriceCents,
    floorCents: inputs.floorCents,
    seasonalityFactor: inputs.seasonalityFactor,
    reasoning,
  };
}
