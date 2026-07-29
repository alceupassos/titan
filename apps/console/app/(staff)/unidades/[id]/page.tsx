// Administração de unidade (studio) — conteúdo demo pedido pelo usuário, seções: KPIs, ocupação,
// pesquisa de comparação de preços (comp set), precificação e reservas recentes. Reusa o MESMO
// pipeline de pricing de apps/console/app/(staff)/pricing/pipeline.ts (comp-set → forecast →
// piso → otimização → explicabilidade) parametrizado por unidade — nenhuma lógica de cálculo
// nova aqui, só fiação sobre `./sample-data.ts` (100% amostra, mesmo espírito de /pricing e
// /estoque: sem Postgres vivo nesta máquina, sem colunas reais de área/capacidade em `units`).
import { notFound } from "next/navigation";
import { forecastOccupancyProbability, runBacktest } from "@titan/domain";
import { format, money } from "@titan/money";
import { ComparisonBarChart, KpiCard, Sparkline, StatusPill } from "@titan/ui";
import type { StatusTone } from "@titan/ui";
import type { Channel, ReservationStatus, UnitStatus } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";
import { runPricingPipeline } from "../../pricing/pipeline";
import { getRealUnitById, type RealUnit } from "../queries";
import {
  STUDIOS,
  SAMPLE_MINIMUM_MARGIN_BASIS_POINTS,
  SAMPLE_TARGET_DATE,
  buildBacktestNights,
  buildOccupancyHistory,
  buildRecentReservations,
  buildVariableCostInputs,
  labelForUnitId,
  marketCandidatesFor,
} from "../sample-data";

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

const CHANNEL_LABEL: Record<Channel, string> = {
  direct: "Direto",
  airbnb: "Airbnb",
  booking: "Booking",
  vrbo: "VRBO",
  expedia: "Expedia",
};

const RESERVATION_STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  no_show: "No-show",
};

const RESERVATION_STATUS_TONE: Record<ReservationStatus, StatusTone> = {
  pending: "warning",
  confirmed: "positive",
  cancelled: "negative",
  no_show: "negative",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function rollingOccupancyRate(history: readonly { occupied: boolean }[], window: number): number[] {
  return history.slice(window - 1).map((_, i) => {
    const slice = history.slice(i, i + window);
    return slice.filter((day) => day.occupied).length / slice.length;
  });
}

/** Página de detalhe de uma unidade REAL cadastrada (Planoexplica.md, "cadastrar unidade") — sem
 * o pipeline de pricing/comp-set dos studios de amostra: uma unidade real só tem histórico de
 * ocupação/preço depois que reservas de verdade existirem para ela (Grupo E, /reservas). Nunca
 * finge um comp set fabricado para uma unidade que não tem dado nenhum ainda. */
function RealUnitDetail({ unit }: { unit: RealUnit }) {
  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-[clamp(1.5rem,2vw,2rem)] font-semibold leading-[1.1] tracking-[-0.01em] text-fg">
          {unit.name}
        </h1>
        <StatusPill tone={STATUS_TONE[unit.status]}>{STATUS_LABEL[unit.status]}</StatusPill>
        {unit.areaSqm ? (
          <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted">{unit.areaSqm}m²</span>
        ) : null}
        {unit.maxCapacity ? (
          <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted">
            até {unit.maxCapacity} pessoas
          </span>
        ) : null}
        {unit.category ? (
          <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted">{unit.category}</span>
        ) : null}
      </div>
      <EmptyState message="Unidade cadastrada de verdade — ocupação, precificação e pesquisa de comparação de mercado aparecem aqui quando houver reservas reais para ela (ver /reservas)." />
    </div>
  );
}

export default async function UnidadeDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const unit = STUDIOS.find((candidate) => candidate.id === id);

  if (!unit) {
    // Não é um dos 4 studios de amostra — tenta como unidade real cadastrada de verdade.
    let session;
    try {
      session = await requireStaffSession();
    } catch (err) {
      const message =
        err instanceof UnauthenticatedError || err instanceof NoActiveTenantError
          ? err.message
          : "Falha ao verificar sessão.";
      return (
        <div className="p-6">
          <EmptyState message={message} />
        </div>
      );
    }
    const realUnit = await getRealUnitById({ tenantId: session.tenantId, actorId: session.userId, unitId: id });
    if (!realUnit) {
      notFound();
    }
    return <RealUnitDetail unit={realUnit} />;
  }

  const seedOffset = Number(unit.code);
  const occupancyHistory = buildOccupancyHistory(seedOffset);
  const candidateUnits = marketCandidatesFor(unit);
  const variableCostInputs = buildVariableCostInputs(seedOffset);
  const ceilingCents = Math.round((unit.currentNightlyPriceCents * 16000) / 10000);

  const pipeline = runPricingPipeline({
    targetUnit: {
      unitId: unit.id,
      category: unit.category,
      capacity: unit.maxCapacity,
      currentNightlyPriceCents: unit.currentNightlyPriceCents,
    },
    candidateUnits,
    occupancyHistory,
    targetDate: SAMPLE_TARGET_DATE,
    variableCostInputs,
    minimumMarginBasisPoints: SAMPLE_MINIMUM_MARGIN_BASIS_POINTS,
    ceilingCents,
  });

  const backtest = runBacktest(buildBacktestNights(seedOffset));
  const deltaPositive = backtest.deltaRevParCents >= 0;

  const reservations = buildRecentReservations(unit, seedOffset);
  const confirmedRevenueCents = reservations
    .filter((r) => r.status === "confirmed")
    .reduce((sum, r) => sum + r.totalCents, 0);

  const occupancyTrend = rollingOccupancyRate(occupancyHistory, 7);
  const currentOccupancyRate = occupancyTrend[occupancyTrend.length - 1] ?? 0;
  const forecastProbability = forecastOccupancyProbability(occupancyHistory, SAMPLE_TARGET_DATE);
  const forecastTrend = Array.from({ length: 6 }, () => forecastProbability);

  const priceDeltaPercent = Math.round(
    ((pipeline.suggestedCents - unit.currentNightlyPriceCents) / unit.currentNightlyPriceCents) * 100,
  );

  const candidateById = new Map(candidateUnits.map((candidate) => [candidate.unitId, candidate]));
  const comparisonItems = pipeline.compSet.map((member) => ({
    label: labelForUnitId(member.unitId),
    priceCents: candidateById.get(member.unitId)?.currentNightlyPriceCents ?? unit.currentNightlyPriceCents,
    highlight: false,
  }));
  comparisonItems.unshift({ label: unit.name, priceCents: unit.currentNightlyPriceCents, highlight: true });

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-[clamp(1.5rem,2vw,2rem)] font-semibold leading-[1.1] tracking-[-0.01em] text-fg">
          {unit.name}
        </h1>
        <StatusPill tone={STATUS_TONE[unit.status]}>{STATUS_LABEL[unit.status]}</StatusPill>
        <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted">{unit.areaSqm}m²</span>
        <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted">
          até {unit.maxCapacity} pessoas
        </span>
        <span className="rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs text-fg-muted capitalize">
          {unit.category}
        </span>
      </div>
      <p className="-mt-4 mb-6 text-sm text-fg-muted">
        Ocupação, precificação e pesquisa de comparação de mercado — dados de amostra (sem Postgres
        vivo nesta máquina, ver docs/fase-atual.md).
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Ocupação (7 dias)"
          value={`${Math.round(currentOccupancyRate * 100)}%`}
          sparkline={<Sparkline points={occupancyTrend} variant="positive" />}
        />
        <KpiCard
          label="RevPAR sugerido (amostra)"
          value={format(money(backtest.suggestedRevParCents, "BRL"))}
          delta={`${deltaPositive ? "+" : ""}${format(money(backtest.deltaRevParCents, "BRL"))}`}
          trend={deltaPositive ? "up" : "down"}
        />
        <KpiCard
          label="Preço sugerido vs. atual"
          value={format(money(pipeline.suggestedCents, "BRL"))}
          delta={`${priceDeltaPercent >= 0 ? "+" : ""}${priceDeltaPercent}%`}
          trend={priceDeltaPercent >= 0 ? "up" : "down"}
        />
        <KpiCard label="Receita confirmada (amostra)" value={format(money(confirmedRevenueCents, "BRL"))} />
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-label text-fg-muted">Ocupação</h2>
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="h-24">
            <Sparkline points={occupancyTrend} forecastPoints={forecastTrend} variant="positive" />
          </div>
          <p className="mt-3 text-xs text-fg-muted">
            Linha sólida: taxa de ocupação móvel (janela de 7 dias) dos últimos 84 dias. Trecho
            tracejado: previsão determinística (heurística por dia da semana, não ML) para{" "}
            {DATE_FORMATTER.format(new Date(`${SAMPLE_TARGET_DATE}T00:00:00Z`))}.
          </p>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-label text-fg-muted">Pesquisa de comparação de preços</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-card border border-border bg-surface p-5">
            <ComparisonBarChart items={comparisonItems} medianCents={pipeline.explanation.compSetMedianPriceCents} />
          </div>
          <div className="rounded-card border border-border bg-surface p-5">
            <div className="mb-3 text-label text-fg-muted">Explicação (amostra)</div>
            <ul className="flex flex-col gap-2 text-sm text-fg">
              {pipeline.explanation.reasoning.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-label text-fg-muted">Precificação</h2>
        <div className="rounded-card border border-border bg-surface p-5">
          <table className="w-full text-left text-sm">
            <tbody>
              <tr className="border-b border-border">
                <td className="py-2 text-fg-muted">Piso de custo variável</td>
                <td className="py-2 tabular-figures">{format(money(pipeline.floorCents, "BRL"))}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 text-fg-muted">Preço sugerido</td>
                <td className="py-2 tabular-figures">{format(money(pipeline.suggestedCents, "BRL"))}</td>
              </tr>
              <tr className="border-b border-border">
                <td className="py-2 text-fg-muted">RevPAR preço fixo (backtest)</td>
                <td className="py-2 tabular-figures">{format(money(backtest.fixedRevParCents, "BRL"))}</td>
              </tr>
              <tr>
                <td className="py-2 text-fg-muted">RevPAR preço sugerido (backtest)</td>
                <td className="py-2 tabular-figures">{format(money(backtest.suggestedRevParCents, "BRL"))}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3">
            <StatusPill tone={deltaPositive ? "positive" : "negative"}>
              {deltaPositive ? "Backtest supera o preço fixo" : "Backtest abaixo do preço fixo"}
            </StatusPill>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-label text-fg-muted">Reservas recentes</h2>
        <div className="overflow-x-auto rounded-card border border-border bg-surface p-5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-fg-muted">
                <th className="pb-2 font-medium">Hóspede</th>
                <th className="pb-2 font-medium">Canal</th>
                <th className="pb-2 font-medium">Check-in</th>
                <th className="pb-2 font-medium">Check-out</th>
                <th className="pb-2 font-medium">Hóspedes</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id} className="border-b border-border last:border-0">
                  <td className="py-2">{reservation.guestName}</td>
                  <td className="py-2 text-fg-muted">{CHANNEL_LABEL[reservation.channel]}</td>
                  <td className="py-2 tabular-figures">
                    {DATE_FORMATTER.format(new Date(`${reservation.checkin}T00:00:00Z`))}
                  </td>
                  <td className="py-2 tabular-figures">
                    {DATE_FORMATTER.format(new Date(`${reservation.checkout}T00:00:00Z`))}
                  </td>
                  <td className="py-2 tabular-figures">{reservation.guestCount}</td>
                  <td className="py-2">
                    <StatusPill tone={RESERVATION_STATUS_TONE[reservation.status]}>
                      {RESERVATION_STATUS_LABEL[reservation.status]}
                    </StatusPill>
                  </td>
                  <td className="py-2 text-right tabular-figures">{format(money(reservation.totalCents, "BRL"))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
