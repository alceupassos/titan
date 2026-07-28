// Orquestração do pipeline de pricing (Fase 8, Passo 5 — docs/fase-atual.md): encadeia os 5
// módulos de `@titan/domain` (comp-set → forecast → variable-cost → optimization →
// explainability) exatamente na ordem da seção 9.7 do prompt único (estágios 1, 3, "piso" (9.11),
// 4, explicabilidade). Nenhuma lógica de cálculo mora aqui — só a fiação entre os módulos, que já
// são puros e testados em `packages/domain/src/pricing/`.
import type { CivilDate } from "@titan/dates";
import {
  buildCompSet,
  computeVariableCostFloorCents,
  explainPriceDecision,
  forecastOccupancyProbability,
  medianCompSetPriceCents,
  optimizeNightlyPriceCents,
  seasonalityFactor,
  type Cents,
  type CompSetMember,
  type OccupancyObservation,
  type PriceExplanation,
  type UnitProfile,
  type VariableCostInputs,
} from "@titan/domain";

export interface RunPricingPipelineParams {
  readonly targetUnit: UnitProfile;
  readonly candidateUnits: readonly UnitProfile[];
  readonly occupancyHistory: readonly OccupancyObservation[];
  readonly targetDate: CivilDate;
  readonly variableCostInputs: VariableCostInputs;
  readonly minimumMarginBasisPoints: number;
  /** Teto de paridade/percepção de mercado — parâmetro externo (nunca calculado por este
   * pipeline); 9.7 trata isso como restrição de otimização, não como saída de nenhum estágio. */
  readonly ceilingCents: Cents;
}

export interface PricingPipelineResult {
  readonly compSet: readonly CompSetMember[];
  readonly floorCents: Cents;
  readonly suggestedCents: Cents;
  readonly expectedRevenueCents: Cents;
  readonly explanation: PriceExplanation;
}

export function runPricingPipeline(params: RunPricingPipelineParams): PricingPipelineResult {
  const compSet = buildCompSet(params.targetUnit, params.candidateUnits, 8);
  const profilesById = new Map(
    [params.targetUnit, ...params.candidateUnits].map((unit) => [unit.unitId, unit]),
  );
  const compSetMedianPriceCents = medianCompSetPriceCents(compSet, profilesById);

  const occupancyProbability = forecastOccupancyProbability(params.occupancyHistory, params.targetDate);
  const seasonality = seasonalityFactor(params.occupancyHistory, params.targetDate);

  const expectedNightlyRevenueCents =
    compSetMedianPriceCents ?? params.targetUnit.currentNightlyPriceCents;
  const floorCents = computeVariableCostFloorCents(
    params.variableCostInputs,
    expectedNightlyRevenueCents,
    params.minimumMarginBasisPoints,
  );

  // Curva de demanda simplificada: a probabilidade de ocupação prevista é ajustada pela
  // sazonalidade e decai linearmente conforme o preço se afasta do piso em direção ao teto —
  // heurística determinística (mesmo espírito do restante do pacote), não uma curva de
  // elasticidade estimada por regressão real.
  const priceRangeCents = Math.max(params.ceilingCents - floorCents, 1);
  const occupancyProbabilityAtPrice = (candidateCents: Cents) => {
    const positionInRange = Math.min(1, Math.max(0, (candidateCents - floorCents) / priceRangeCents));
    return Math.max(0, Math.min(1, occupancyProbability * seasonality * (1 - 0.5 * positionInRange)));
  };

  const optimized = optimizeNightlyPriceCents({
    floorCents,
    ceilingCents: params.ceilingCents,
    occupancyProbabilityAtPrice,
    stepCents: 500,
  });

  const explanation = explainPriceDecision({
    compSet,
    compSetMedianPriceCents,
    floorCents,
    seasonalityFactor: seasonality,
    finalPriceCents: optimized.suggestedCents,
  });

  return {
    compSet,
    floorCents,
    suggestedCents: optimized.suggestedCents,
    expectedRevenueCents: optimized.expectedRevenueCents,
    explanation,
  };
}
