// Reescrita do placeholder da Fase 1 (Fase 8, Passo 5 — docs/fase-atual.md). Roda o pipeline de
// pricing (packages/domain/src/pricing/ via ./pipeline.ts) e o backtest sobre AMOSTRA estática
// (./sample-data.ts) — sem Postgres vivo nesta máquina (Gap conhecido 2) nem colunas reais de
// categoria/capacidade em `units` (gap novo desta fase, ver comentário de ./sample-data.ts), esta
// página Server Component não consulta packages/db para LER ainda. As duas funções abaixo são,
// ainda assim, CALCULADAS de verdade sobre a amostra com a MESMA lógica de domínio que uma
// execução real usaria — trocar a fonte por dados reais (unit real + histórico real) é a única
// mudança necessária quando o Postgres estiver de pé e `inventory` ganhar as colunas que faltam,
// nunca a lógica de ./pipeline.ts.
import { runBacktest } from "@titan/domain";
import { format, money } from "@titan/money";
import { KpiCard, StatusPill } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { runPricingPipeline } from "./pipeline";
import { PricingSuggestionPanel } from "./PricingSuggestionPanel";
import {
  SAMPLE_BACKTEST_NIGHTS,
  SAMPLE_CANDIDATE_UNITS,
  SAMPLE_MINIMUM_MARGIN_BASIS_POINTS,
  SAMPLE_OCCUPANCY_HISTORY,
  SAMPLE_TARGET_DATE,
  SAMPLE_TARGET_UNIT,
  SAMPLE_VARIABLE_COST_INPUTS,
} from "./sample-data";

export default function PricingPage() {
  const pipeline = runPricingPipeline({
    targetUnit: SAMPLE_TARGET_UNIT,
    candidateUnits: SAMPLE_CANDIDATE_UNITS,
    occupancyHistory: SAMPLE_OCCUPANCY_HISTORY,
    targetDate: SAMPLE_TARGET_DATE,
    variableCostInputs: SAMPLE_VARIABLE_COST_INPUTS,
    minimumMarginBasisPoints: SAMPLE_MINIMUM_MARGIN_BASIS_POINTS,
    ceilingCents: Math.round((SAMPLE_TARGET_UNIT.currentNightlyPriceCents * 16000) / 10000),
  });

  const backtest = runBacktest(SAMPLE_BACKTEST_NIGHTS);
  const deltaPositive = backtest.deltaRevParCents >= 0;

  return (
    <div className="p-6">
      <PageHeader
        title="Pricing"
        description="Sugestões, explicabilidade, backtest e autonomia do modelo. Dados de amostra — sem Postgres vivo nesta máquina, ver docs/fase-atual.md."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Preço sugerido (amostra)" value={format(money(pipeline.suggestedCents, "BRL"))} />
        <KpiCard label="Piso de custo variável" value={format(money(pipeline.floorCents, "BRL"))} />
        <KpiCard
          label="ΔRevPAR backtest"
          value={format(money(backtest.deltaRevParCents, "BRL"))}
          trend={deltaPositive ? "up" : "down"}
        />
        <KpiCard label="Comp set (amostra)" value={String(pipeline.compSet.length)} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-3 text-label text-fg-muted">Explicação por noite (amostra)</div>
          <ul className="flex flex-col gap-2 text-sm text-fg">
            {pipeline.explanation.reasoning.map((line, i) => (
              <li key={i}>• {line}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-3 text-label text-fg-muted">Backtest — heurística determinística, não ML</div>
          <table className="w-full text-left text-sm">
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 text-fg-muted">RevPAR preço fixo</td>
                <td className="py-2 tabular-figures">{format(money(backtest.fixedRevParCents, "BRL"))}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 text-fg-muted">RevPAR preço sugerido</td>
                <td className="py-2 tabular-figures">{format(money(backtest.suggestedRevParCents, "BRL"))}</td>
              </tr>
              <tr>
                <td className="py-2 text-fg-muted">Noites simuladas</td>
                <td className="py-2 tabular-figures">{backtest.nightsCount}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3">
            <StatusPill tone={deltaPositive ? "positive" : "negative"}>
              {deltaPositive ? "Backtest supera o preço fixo" : "Backtest abaixo do preço fixo"}
            </StatusPill>
          </div>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <div className="mb-3 text-label text-fg-muted">Rodar sugestão de preço (unidade de amostra)</div>
        <PricingSuggestionPanel unitId={SAMPLE_TARGET_UNIT.unitId} date={SAMPLE_TARGET_DATE} />
      </div>
    </div>
  );
}
