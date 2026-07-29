// Lista de unidades — duas seções: (1) unidades REAIS cadastradas de verdade (Planoexplica.md,
// "cadastrar unidade" — ./queries.ts, ./nova), e (2) os 4 studios de DEMONSTRAÇÃO do pipeline de
// pricing/comp-set (506/609/312/409, ./sample-data.ts) — mantidos porque são o que mostra como a
// pesquisa de comparação de preços vai funcionar; nunca misturados na mesma lista, para não
// confundir dado real com dado fabricado.
import Link from "next/link";
import { format, money } from "@titan/money";
import { Button, StatusPill, Sparkline } from "@titan/ui";
import type { StatusTone } from "@titan/ui";
import type { UnitStatus } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";
import { STUDIOS, buildOccupancyHistory } from "./sample-data";
import { listRealUnitsForTenant, type RealUnit } from "./queries";

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

function RealUnitCard({ unit }: { unit: RealUnit }) {
  return (
    <Link
      href={`/unidades/${unit.id}`}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5 transition-shadow duration-200 ease-[var(--ease-standard)] hover:shadow-[0_4px_16px_oklch(0_0_0_/_24%)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[1.0625rem] font-semibold text-fg">{unit.name}</div>
          <div className="mt-1 text-sm text-fg-muted">
            {unit.category ?? "Categoria não informada"}
            {unit.areaSqm ? ` · ${unit.areaSqm}m²` : ""}
            {unit.maxCapacity ? ` · até ${unit.maxCapacity} pessoas` : ""}
          </div>
        </div>
        <StatusPill tone={STATUS_TONE[unit.status]}>{STATUS_LABEL[unit.status]}</StatusPill>
      </div>
    </Link>
  );
}

export default async function UnidadesPage() {
  let realUnits: RealUnit[] = [];
  let loadError: string | null = null;

  try {
    const session = await requireStaffSession();
    if (session.ability.can("read", "unit")) {
      realUnits = await listRealUnitsForTenant({ tenantId: session.tenantId, actorId: session.userId });
    }
  } catch (err) {
    loadError =
      err instanceof UnauthenticatedError || err instanceof NoActiveTenantError
        ? err.message
        : "Não foi possível consultar as unidades cadastradas agora.";
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader
          title="Unidades"
          description="Cadastro real de unidades + demonstração de ocupação/precificação."
        />
        <Link href="/unidades/nova">
          <Button variant="primary">Nova unidade</Button>
        </Link>
      </div>

      <section className="mb-10">
        <h2 className="mb-3 text-label text-fg-muted">Unidades cadastradas</h2>
        {loadError ? (
          <EmptyState message={loadError} />
        ) : realUnits.length === 0 ? (
          <EmptyState message="Nenhuma unidade cadastrada ainda — use “Nova unidade” para adicionar a primeira." />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {realUnits.map((unit) => (
              <RealUnitCard key={unit.id} unit={unit} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-label text-fg-muted">Studios de demonstração</h2>
        <p className="mb-3 text-xs text-fg-muted">
          Dado fabricado — mostra como ocupação, precificação e comparação de mercado vão
          funcionar quando uma unidade real tiver histórico de reservas.
        </p>
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
      </section>
    </div>
  );
}
