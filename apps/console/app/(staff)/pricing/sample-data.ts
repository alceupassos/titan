// Dados de amostra determinísticos para o painel de /pricing — sem Postgres vivo nesta máquina
// (Gap conhecido 2, docs/fase-atual.md) e sem coordenadas/categoria/capacidade reais na tabela
// `units` (bounded context `inventory` ainda não modelado — gap novo identificado na Fase 8: o
// comp set por atributos cadastrais precisa desses campos, que hoje só existem aqui como amostra,
// nunca lidos de uma coluna real). Trocar por `./queries.ts` real é a única mudança necessária
// quando `inventory`/histórico de ocupação ganharem colunas reais — mesmo padrão de todas as
// fases anteriores.
import type { CivilDate } from "@titan/dates";
import { civilDate } from "@titan/dates";
import type { OccupancyObservation, UnitProfile } from "@titan/domain";

// unitId sempre em formato UUID (mesmo quando é dado de amostra) — RunPricingSuggestionSchema/
// PublishPriceSchema (packages/contracts/src/pricing.ts) exigem `z.string().uuid()`, mesmo padrão
// de todas as fases anteriores (ex. packages/db seed ids "e0000000-...").
export const SAMPLE_TARGET_UNIT: UnitProfile = {
  unitId: "a0000000-0000-4000-8000-000000000001",
  category: "studio",
  capacity: 2,
  currentNightlyPriceCents: 22000,
};

export const SAMPLE_CANDIDATE_UNITS: UnitProfile[] = [
  { unitId: "a0000000-0000-4000-8000-000000000002", category: "studio", capacity: 2, currentNightlyPriceCents: 21000 },
  { unitId: "a0000000-0000-4000-8000-000000000003", category: "studio", capacity: 3, currentNightlyPriceCents: 24000 },
  { unitId: "a0000000-0000-4000-8000-000000000004", category: "casa", capacity: 6, currentNightlyPriceCents: 45000 },
  { unitId: "a0000000-0000-4000-8000-000000000005", category: "studio", capacity: 2, currentNightlyPriceCents: 20000 },
];

/** 12 semanas de histórico de ocupação sintético (mesmo dia da semana tende a se repetir —
 * fins de semana mais ocupados que dias úteis), determinístico (sem `Math.random()`). */
export const SAMPLE_OCCUPANCY_HISTORY: OccupancyObservation[] = Array.from({ length: 84 }, (_, i) => {
  const daysAgo = 84 - i;
  const date = new Date("2026-01-26T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - daysAgo);
  const iso = date.toISOString().slice(0, 10);
  const dow = date.getUTCDay();
  // Fins de semana (sexta=5, sábado=6) ocupam ~85%; dias úteis ~45% — padrão determinístico via
  // índice, não aleatório.
  const isWeekend = dow === 5 || dow === 6;
  const occupied = isWeekend ? i % 6 !== 0 : i % 9 < 4;
  return { date: civilDate(iso), occupied };
});

export const SAMPLE_TARGET_DATE: CivilDate = civilDate("2026-08-01"); // sábado

/** Custo variável de amostra — limpeza real via accounts_payable (Fase 5/7), reposição de
 * enxoval real via stock_movements.unit_cost_cents (Fase 7/8), comissão/taxa de gateway ainda
 * provisionadas a zero por dívida técnica das Fases 2/3 (documentado, não fingido). */
export const SAMPLE_VARIABLE_COST_INPUTS = {
  cleaningCostCents: 8000,
  linenReplenishmentCostCents: 1500,
  channelCommissionBasisPoints: 0, // dívida técnica Fase 3 — provisionado a zero
  gatewayRateBasisPoints: 0, // dívida técnica Fase 2 — provisionado a zero
};

export const SAMPLE_MINIMUM_MARGIN_BASIS_POINTS = 2000; // 20%

/** Cenário sintético de backtest (30 noites) — mesmo espírito do teste de domínio que prova o
 * portão de saída, aqui só para exibir o ΔRevPAR no KPI da página. */
export const SAMPLE_BACKTEST_NIGHTS = [
  ...Array.from({ length: 12 }, () => ({
    date: civilDate("2026-06-01"),
    fixedPriceCents: 25000,
    suggestedPriceCents: 16000,
    simulatedOccupiedAtFixedPrice: false,
    simulatedOccupiedAtSuggestedPrice: true,
  })),
  ...Array.from({ length: 12 }, () => ({
    date: civilDate("2026-06-02"),
    fixedPriceCents: 25000,
    suggestedPriceCents: 30000,
    simulatedOccupiedAtFixedPrice: true,
    simulatedOccupiedAtSuggestedPrice: true,
  })),
  ...Array.from({ length: 6 }, () => ({
    date: civilDate("2026-06-03"),
    fixedPriceCents: 20000,
    suggestedPriceCents: 20000,
    simulatedOccupiedAtFixedPrice: true,
    simulatedOccupiedAtSuggestedPrice: true,
  })),
];
