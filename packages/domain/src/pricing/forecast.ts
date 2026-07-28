// Estágio 3 do pipeline da seção 9.7 ("Forecast"). Redução de escopo deliberada (docs/roadmap.md,
// Fase 8): sem infra de treino/serving de modelo nesta sessão, o forecast aqui é uma heurística
// DETERMINÍSTICA (taxa histórica de ocupação no mesmo dia da semana, janela móvel) —
// explicitamente NÃO um modelo de ML (LightGBM/CatBoost previstos na especificação completa),
// mesmo padrão já usado para `computeReorderPoint` em `packages/domain/src/supply/stock.ts`
// (Fase 7). MAPE por horizonte de lead time (exigido pelo `pricing-scientist.md`) não se aplica
// aqui — não há modelo real para medir erro de previsão contra; documentado, não fingido.
import type { CivilDate } from "@titan/dates";

export interface OccupancyObservation {
  readonly date: CivilDate;
  readonly occupied: boolean;
}

export class EmptyOccupancyHistoryError extends Error {
  constructor() {
    super("Histórico de ocupação vazio — não é possível estimar probabilidade sem observações.");
    this.name = "EmptyOccupancyHistoryError";
  }
}

/** Dia da semana (0=domingo..6=sábado) de uma `CivilDate` — mesma técnica de `nights()` em
 * `@titan/dates`: parse como UTC-meia-noite para nunca cair no dia anterior por fuso. */
function dayOfWeek(date: CivilDate): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/**
 * Probabilidade de ocupação prevista para `targetDate` — heurística: taxa de ocupação histórica
 * observada no MESMO dia da semana de `targetDate`, dentro da `history` fornecida (o chamador já
 * filtra a janela móvel relevante, ex. últimas 12 semanas — zero I/O aqui). Se não houver nenhuma
 * observação no mesmo dia da semana, cai para a taxa geral de todo o histórico (nunca lança nesse
 * caso — só lança se `history` estiver inteiramente vazio, quando não há absolutamente nenhum
 * dado para fallback).
 */
export function forecastOccupancyProbability(
  history: readonly OccupancyObservation[],
  targetDate: CivilDate,
): number {
  if (history.length === 0) {
    throw new EmptyOccupancyHistoryError();
  }

  const targetDow = dayOfWeek(targetDate);
  const sameDow = history.filter((observation) => dayOfWeek(observation.date) === targetDow);

  const pool = sameDow.length > 0 ? sameDow : history;
  const occupiedCount = pool.filter((observation) => observation.occupied).length;

  return occupiedCount / pool.length;
}

/** Fator de sazonalidade simples (>1 acima da média geral, <1 abaixo) para o dia da semana de
 * `targetDate` — usado pela camada de explicabilidade (`explainability.ts`) para reportar "quanto
 * a sazonalidade pesou" separadamente da ocupação prevista em si. Retorna 1 (neutro) se a média
 * geral for zero (sem ocupação nenhuma no histórico — nada para comparar). */
export function seasonalityFactor(history: readonly OccupancyObservation[], targetDate: CivilDate): number {
  if (history.length === 0) {
    throw new EmptyOccupancyHistoryError();
  }

  const overallRate = history.filter((observation) => observation.occupied).length / history.length;
  if (overallRate === 0) {
    return 1;
  }

  const targetDow = dayOfWeek(targetDate);
  const sameDow = history.filter((observation) => dayOfWeek(observation.date) === targetDow);
  if (sameDow.length === 0) {
    return 1;
  }

  const dowRate = sameDow.filter((observation) => observation.occupied).length / sameDow.length;
  return dowRate / overallRate;
}
