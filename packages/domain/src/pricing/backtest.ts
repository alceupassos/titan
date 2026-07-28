// Portão de saída da Fase 8 (docs/roadmap.md): "Backtest ΔRevPAR ≥ 0 vs. preço fixo". Redução de
// escopo deliberada: sem Postgres vivo/histórico real nesta sessão (Gap conhecido 2), o backtest
// roda sobre um histórico já carregado pelo chamador (sintético em teste, real quando o banco
// estiver de pé) — zero I/O aqui. Disciplina exigida por `.claude/agents/pricing-scientist.md`:
// "reporte o ΔRevPAR real no backtest contra preço fixo; se não superar o baseline, diga isso em
// vez de ajustar a métrica até parecer boa" — `runBacktest` NUNCA arredonda/força o delta para
// não ficar negativo; ele reporta o que o cálculo produzir.
import type { Cents } from "../ledger/ledger-entry";
import type { CivilDate } from "@titan/dates";

export interface BacktestNight {
  readonly date: CivilDate;
  readonly fixedPriceCents: Cents;
  readonly suggestedPriceCents: Cents;
  /** Ocupação simulada — o chamador decide a fonte (reserva real do dia no cenário histórico,
   * ou simulação estocástica sobre uma curva de demanda; este módulo é agnóstico à origem). */
  readonly simulatedOccupiedAtFixedPrice: boolean;
  readonly simulatedOccupiedAtSuggestedPrice: boolean;
}

export interface BacktestResult {
  readonly nightsCount: number;
  readonly fixedRevParCents: Cents;
  readonly suggestedRevParCents: Cents;
  /** Pode ser negativo — nunca mascarado. Ver disciplina no cabeçalho do arquivo. */
  readonly deltaRevParCents: Cents;
}

export class EmptyBacktestHistoryError extends Error {
  constructor() {
    super("Histórico de backtest vazio — não é possível calcular RevPAR sem nenhuma noite.");
    this.name = "EmptyBacktestHistoryError";
  }
}

/**
 * RevPAR (receita por noite disponível) = soma da receita realizada (preço × 1 se ocupado, 0 se
 * vago) dividida pelo número TOTAL de noites disponíveis no período (ocupadas ou não) — definição
 * padrão do setor, não "receita média por noite ocupada" (que seria ADR, não RevPAR).
 */
function computeRevParCents(
  nights: readonly BacktestNight[],
  priceOf: (night: BacktestNight) => Cents,
  occupiedOf: (night: BacktestNight) => boolean,
): Cents {
  const totalRevenueCents = nights.reduce(
    (sum, night) => sum + (occupiedOf(night) ? priceOf(night) : 0),
    0,
  );
  return Math.round(totalRevenueCents / nights.length);
}

/**
 * Compara RevPAR do preço fixo vs. do preço sugerido sobre o mesmo histórico de noites. Lança
 * `EmptyBacktestHistoryError` para histórico vazio (nunca retorna um resultado inventado, ex.
 * zero, quando não há dado nenhum).
 */
export function runBacktest(nights: readonly BacktestNight[]): BacktestResult {
  if (nights.length === 0) {
    throw new EmptyBacktestHistoryError();
  }

  const fixedRevParCents = computeRevParCents(
    nights,
    (night) => night.fixedPriceCents,
    (night) => night.simulatedOccupiedAtFixedPrice,
  );
  const suggestedRevParCents = computeRevParCents(
    nights,
    (night) => night.suggestedPriceCents,
    (night) => night.simulatedOccupiedAtSuggestedPrice,
  );

  return {
    nightsCount: nights.length,
    fixedRevParCents,
    suggestedRevParCents,
    deltaRevParCents: suggestedRevParCents - fixedRevParCents,
  };
}
