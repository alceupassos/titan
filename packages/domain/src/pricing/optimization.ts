// Estágio 4 do pipeline da seção 9.7 ("Otimização"). Redução de escopo deliberada (docs/
// roadmap.md, Fase 8): busca em grade determinística dentro de [floor, ceiling], nunca abaixo do
// piso de custo variável (packages/domain/src/pricing/variable-cost.ts) — sem exploração via
// bandit contextual (Thompson sampling) prevista na especificação completa, fora de escopo desta
// fase. Zero I/O: `occupancyProbabilityAtPrice` é uma função pura fornecida pelo chamador (ex.:
// curva derivada de `forecastOccupancyProbability` ajustada por elasticidade de preço).
import type { Cents } from "../ledger/ledger-entry";

export interface OptimizePriceParams {
  readonly floorCents: Cents;
  readonly ceilingCents: Cents;
  /** Probabilidade de ocupação (0-1) para um preço candidato — função pura, fornecida pelo
   * chamador. Nunca lê estado externo aqui; a otimização só avalia essa função em cada ponto da
   * grade. Decisão de design: esta função NUNCA valida/clampa o retorno do chamador (mesmo padrão
   * de `computeRevParCents` em `backtest.ts`, que também confia cegamente em callbacks do
   * chamador) — se a função fornecida devolver algo fora de [0,1] (ex. negativo por bug do
   * chamador), o cálculo de receita esperada simplesmente propaga esse valor sem lançar erro. */
  readonly occupancyProbabilityAtPrice: (priceCents: Cents) => number;
  readonly stepCents: Cents;
}

export interface OptimizePriceResult {
  readonly suggestedCents: Cents;
  readonly expectedRevenueCents: Cents;
}

export class InvalidPriceRangeError extends Error {
  constructor(floorCents: Cents, ceilingCents: Cents) {
    super(`Faixa de preço inválida: floor (${floorCents}) deve ser <= ceiling (${ceilingCents}).`);
    this.name = "InvalidPriceRangeError";
  }
}

export class InvalidStepError extends Error {
  constructor(stepCents: Cents) {
    super(`stepCents deve ser positivo (recebido ${stepCents}).`);
    this.name = "InvalidStepError";
  }
}

/**
 * Busca em grade dentro de `[floorCents, ceilingCents]` (passo `stepCents`) maximizando receita
 * esperada = preço × probabilidade de ocupação naquele preço. Nunca retorna um preço abaixo do
 * `floorCents` (o piso é o próprio limite inferior da grade, não uma checagem posterior) nem
 * acima do `ceilingCents` (paridade/percepção de mercado — parâmetro do chamador, não calculado
 * aqui). Em empate de receita esperada, prefere o preço MENOR (mesma lógica de "nunca escolher a
 * opção mais agressiva silenciosamente em caso de ambiguidade" já usada em outras partes do
 * domínio, ex. `resolveTaxRuleForDate` recusando vigência ambígua em vez de escolher a primeira).
 */
export function optimizeNightlyPriceCents(params: OptimizePriceParams): OptimizePriceResult {
  const { floorCents, ceilingCents, occupancyProbabilityAtPrice, stepCents } = params;

  if (floorCents > ceilingCents) {
    throw new InvalidPriceRangeError(floorCents, ceilingCents);
  }
  if (stepCents <= 0) {
    throw new InvalidStepError(stepCents);
  }

  let bestPriceCents = floorCents;
  let bestExpectedRevenueCents = floorCents * occupancyProbabilityAtPrice(floorCents);

  for (let candidateCents = floorCents + stepCents; candidateCents <= ceilingCents; candidateCents += stepCents) {
    const expectedRevenueCents = candidateCents * occupancyProbabilityAtPrice(candidateCents);
    if (expectedRevenueCents > bestExpectedRevenueCents) {
      bestExpectedRevenueCents = expectedRevenueCents;
      bestPriceCents = candidateCents;
    }
  }

  return {
    suggestedCents: bestPriceCents,
    expectedRevenueCents: Math.round(bestExpectedRevenueCents),
  };
}
