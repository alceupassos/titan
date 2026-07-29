// Listagem real de reservas (Grupo E, planoexplica.md) — substitui o placeholder da Fase 1.
// Mesmo padrão de apps/console/app/(staff)/financeiro/dre/page.tsx: Server Component lendo
// `searchParams` (form GET), autorizando com CASL antes de qualquer leitura, chamando
// ./queries.ts dentro de `withTenant`. Filtro por CHECK-IN (não `created_at`) — é o que o
// usuário espera ao filtrar uma lista de reservas por data.
import Link from "next/link";
import { Button, KpiCard, StatusPill } from "@titan/ui";
import type { StatusTone } from "@titan/ui";
import type { Channel, ReservationStatus } from "@titan/domain";
import { format, money } from "@titan/money";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";
import {
  getReservationKpis,
  listReservations,
  listUnitsForTenant,
  type ReservationListItem,
  type UnitOption,
} from "./queries";

const PAGE_SIZE = 20;

const CHANNEL_LABEL: Record<Channel, string> = {
  direct: "Direto",
  airbnb: "Airbnb",
  booking: "Booking",
  vrbo: "VRBO",
  expedia: "Expedia",
};

const STATUS_LABEL: Record<ReservationStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmada",
  cancelled: "Cancelada",
  no_show: "No-show",
};

const STATUS_TONE: Record<ReservationStatus, StatusTone> = {
  pending: "warning",
  confirmed: "positive",
  cancelled: "negative",
  no_show: "negative",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

interface ReservasSearchParams {
  start?: string;
  end?: string;
  unitId?: string;
  status?: string;
  page?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Mesma conversão inclusivo->exclusivo de financeiro/dre/page.tsx — o campo "fim" do formulário
 * é inclusivo do ponto de vista do usuário, `queries.ts` espera o limite exclusivo. */
function toExclusiveEndISO(inclusiveEndISO: string): string {
  const asDate = new Date(`${inclusiveEndISO}T00:00:00.000Z`);
  asDate.setUTCDate(asDate.getUTCDate() + 1);
  return toISODate(asDate);
}

function isValidStatus(value: string | undefined): value is ReservationStatus {
  return value === "pending" || value === "confirmed" || value === "cancelled" || value === "no_show";
}

function buildQueryString(
  params: Record<string, string | undefined>,
  overrides: Record<string, string | undefined>,
): string {
  const merged = { ...params, ...overrides };
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(merged)) {
    if (value) usp.set(key, value);
  }
  return usp.toString();
}

function ReservationRow({ item }: { item: ReservationListItem }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2">
        <Link href={`/reservas/${item.id}`} className="text-fg underline-offset-4 hover:underline">
          {item.unitName}
        </Link>
      </td>
      <td className="py-2 text-fg-muted">{CHANNEL_LABEL[item.channel]}</td>
      <td className="py-2 tabular-figures">{DATE_FORMATTER.format(new Date(`${item.stay.checkin}T00:00:00Z`))}</td>
      <td className="py-2 tabular-figures">{DATE_FORMATTER.format(new Date(`${item.stay.checkout}T00:00:00Z`))}</td>
      <td className="py-2 tabular-figures">{item.guestCount ?? "—"}</td>
      <td className="py-2">
        <StatusPill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</StatusPill>
      </td>
      <td className="py-2 text-right tabular-figures">{format(money(item.priceCents, item.currency as "BRL"))}</td>
    </tr>
  );
}

export default async function ReservasPage({
  searchParams,
}: {
  searchParams: Promise<ReservasSearchParams>;
}) {
  const params = await searchParams;
  const unitId = params.unitId && params.unitId.length > 0 ? params.unitId : undefined;
  const status = isValidStatus(params.status) ? params.status : undefined;
  const page = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);

  const header = (
    <div className="mb-6 flex items-start justify-between gap-4">
      <PageHeader title="Reservas" description="Reservas confirmadas e propostas, todos os canais." />
      <Link href="/reservas/nova">
        <Button variant="primary">Nova reserva</Button>
      </Link>
    </div>
  );

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
        {header}
        <EmptyState message={message} />
      </div>
    );
  }

  if (session.ability.cannot("read", "reservation")) {
    return (
      <div className="p-6">
        {header}
        <EmptyState message="Sem permissão para consultar reservas com o papel atual." />
      </div>
    );
  }

  let kpis: Awaited<ReturnType<typeof getReservationKpis>> | null = null;
  let unitOptions: UnitOption[] = [];
  let items: ReservationListItem[] = [];
  let matchCount = 0;
  let loadError: string | null = null;

  try {
    const [kpiResult, unitsResult, listResult] = await Promise.all([
      getReservationKpis({ tenantId: session.tenantId, actorId: session.userId }),
      listUnitsForTenant({ tenantId: session.tenantId, actorId: session.userId }),
      listReservations({
        tenantId: session.tenantId,
        actorId: session.userId,
        ...(params.start ? { checkinFromISO: params.start } : {}),
        ...(params.end ? { checkinToExclusiveISO: toExclusiveEndISO(params.end) } : {}),
        ...(unitId ? { unitId } : {}),
        ...(status ? { status } : {}),
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      }),
    ]);
    kpis = kpiResult;
    unitOptions = unitsResult;
    items = listResult.items;
    matchCount = listResult.matchCount;
  } catch {
    // Nunca mostrar "nenhuma reserva" fingido quando na verdade é falha de leitura (Gap
    // conhecido 2, docs/fase-atual.md, ou qualquer outra falha real de conexão).
    loadError = "Não foi possível consultar reservas agora (falha de leitura no banco).";
  }

  const totalPages = Math.max(1, Math.ceil(matchCount / PAGE_SIZE));
  const exportQuery = buildQueryString({ start: params.start, end: params.end, unitId, status }, {});

  return (
    <div className="p-6">
      {header}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Reservas ativas" value={kpis ? String(kpis.activeCount) : "0"} state={kpis ? "ready" : "empty"} />
        <KpiCard
          label="Chegando em 7 dias"
          value={kpis ? String(kpis.arrivingNext7DaysCount) : "0"}
          state={kpis ? "ready" : "empty"}
        />
        <KpiCard
          label="Canceladas (mês)"
          value={kpis ? String(kpis.cancelledThisMonthCount) : "0"}
          state={kpis ? "ready" : "empty"}
        />
      </div>

      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-4 rounded-card border border-border bg-surface p-6"
      >
        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Check-in de</span>
          <input
            type="date"
            name="start"
            defaultValue={params.start ?? ""}
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm tabular-figures text-fg"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">até</span>
          <input
            type="date"
            name="end"
            defaultValue={params.end ?? ""}
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm tabular-figures text-fg"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Unidade</span>
          <select
            name="unitId"
            defaultValue={unitId ?? ""}
            className="w-full min-w-[12rem] rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg"
          >
            <option value="">Todas</option>
            {unitOptions.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Status</span>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="w-full min-w-[10rem] rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg"
          >
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABEL) as ReservationStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-control bg-accent px-5 py-2 text-sm font-medium text-accent-fg hover:brightness-95"
        >
          Filtrar
        </button>
        <a
          href={`/api/reservas/export${exportQuery ? `?${exportQuery}` : ""}`}
          className="ml-auto rounded-control border border-border px-5 py-2 text-sm font-medium text-fg-muted hover:text-fg"
        >
          Exportar CSV
        </a>
      </form>

      {loadError ? (
        <EmptyState message={loadError} />
      ) : items.length === 0 ? (
        <EmptyState message="Nenhuma reserva encontrada para este filtro." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface p-5">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs text-fg-muted">
                <th className="pb-2 font-medium">Unidade</th>
                <th className="pb-2 font-medium">Canal</th>
                <th className="pb-2 font-medium">Check-in</th>
                <th className="pb-2 font-medium">Check-out</th>
                <th className="pb-2 font-medium">Hóspedes</th>
                <th className="pb-2 font-medium">Status</th>
                <th className="pb-2 text-right font-medium">Preço</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ReservationRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between text-sm text-fg-muted">
            <span>
              {matchCount} reserva{matchCount === 1 ? "" : "s"} — página {page} de {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link
                  href={`/reservas?${buildQueryString({ ...params }, { page: String(page - 1) })}`}
                  className="rounded-control border border-border px-3 py-1.5 hover:text-fg"
                >
                  ← Anterior
                </Link>
              ) : null}
              {page < totalPages ? (
                <Link
                  href={`/reservas?${buildQueryString({ ...params }, { page: String(page + 1) })}`}
                  className="rounded-control border border-border px-3 py-1.5 hover:text-fg"
                >
                  Próxima →
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
