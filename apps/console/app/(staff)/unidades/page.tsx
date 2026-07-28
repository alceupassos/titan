// Lista de administração de unidades (studios) — conteúdo demo pedido pelo usuário: 4 studios de
// 40m², capacidade máxima 6 pessoas (506, 609, 312, 409). Dado 100% de amostra (`./sample-data.ts`)
// — mesmo espírito de apps/console/app/(staff)/pricing/page.tsx e .../estoque/page.tsx: sem
// Postgres vivo nesta máquina e sem colunas reais de área/capacidade em `units` (Gap conhecido 2 +
// gap de `inventory` documentado desde a Fase 8). Trocar por uma query real de `packages/db` é a
// única mudança necessária quando essas colunas existirem.
import Link from "next/link";
import { format, money } from "@titan/money";
import { StatusPill, Sparkline } from "@titan/ui";
import type { StatusTone } from "@titan/ui";
import type { UnitStatus } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { STUDIOS, buildOccupancyHistory } from "./sample-data";

const STATUS_LABEL: Record<UnitStatus, string> = {
  ready: "Pronta",
  occupied: "Ocupada",
  dirty: "Suja",
  cleaning: "Em limpeza",
  clean: "Limpa",
  inspected: "Inspecionada",
  blocked: "Bloqueada",
  rework: "Retrabalho",
};

const STATUS_TONE: Record<UnitStatus, StatusTone> = {
  ready: "positive",
  occupied: "info",
  dirty: "warning",
  cleaning: "warning",
  clean: "info",
  inspected: "positive",
  blocked: "negative",
  rework: "negative",
};

/** Taxa de ocupação móvel (janela de 7 dias) — transforma a série booleana bruta de
 * `OccupancyObservation` num sparkline legível, em vez de um sinal binário serrilhado. */
function rollingOccupancyRate(history: readonly { occupied: boolean }[], window: number): number[] {
  return history.slice(window - 1).map((_, i) => {
    const slice = history.slice(i, i + window);
    return slice.filter((day) => day.occupied).length / slice.length;
  });
}

export default function UnidadesPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Unidades"
        description="Administração dos studios — ocupação, precificação e pesquisa de comparação de mercado. Dados de amostra (sem Postgres vivo nesta máquina)."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STUDIOS.map((unit) => {
          const occupancyTrend = rollingOccupancyRate(buildOccupancyHistory(Number(unit.code)), 7);
          return (
            <Link
              key={unit.id}
              href={`/unidades/${unit.id}`}
              className="group flex flex-col gap-4 rounded-card border border-border bg-surface p-5 transition-shadow duration-200 ease-[var(--ease-standard)] hover:shadow-[0_4px_16px_oklch(0_0_0_/_24%)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[1.0625rem] font-semibold text-fg">{unit.name}</div>
                  <div className="mt-1 text-sm text-fg-muted">
                    {unit.areaSqm}m² · até {unit.maxCapacity} pessoas
                  </div>
                </div>
                <StatusPill tone={STATUS_TONE[unit.status]}>{STATUS_LABEL[unit.status]}</StatusPill>
              </div>

              <div className="h-10">
                <Sparkline points={occupancyTrend} variant="positive" />
              </div>

              <div className="flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-xs text-fg-muted">Diária atual</span>
                <span className="tabular-figures text-lg font-semibold">
                  {format(money(unit.currentNightlyPriceCents, "BRL"))}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
