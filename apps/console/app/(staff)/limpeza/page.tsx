// Quadro do dia de limpeza (Fase 6, Passo 4b — docs/fase-atual.md; seção 9.8 do prompt único). A
// fonte de verdade do estado é `units.status` (I9, packages/domain/src/unit/state-machine.ts) —
// `cleaning_tasks` só registra QUEM está executando a virada e o resultado do checklist, nunca
// uma FSM paralela. Colunas: dirty -> cleaning -> clean -> inspected -> rework (rework volta para
// cleaning), espelhando docs/domain/modelo-dominio.md §2.
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), então esta página Server
// Component não consulta `packages/db` para LER ainda — mesmo padrão de
// apps/console/app/(staff)/distribuicao/page.tsx. Os cálculos abaixo (contagens, checkout
// estimado, contagem regressiva, semáforo de risco) são, ainda assim, feitos DE VERDADE sobre a
// amostra (nunca hardcoded) com a MESMA lógica que uma query real (`withTenant(...).select()
// .from(units).innerJoin(cleaningTasks, ...).leftJoin(reservations, ...)`) usaria — trocar a
// fonte é a única mudança necessária quando o banco estiver de pé.
//
// O CAMINHO DE ESCRITA (`assignCleaningTaskAction`, `reassignCleaningTaskAction` — ./actions.ts,
// chamados pelo client component abaixo) já é real, contra o banco via `withTenant`.
import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { CleaningBoard, type CleaningBoardCard } from "./CleaningBoard";
import {
  NOW_ANCHOR_EPOCH_MS,
  SAMPLE_CLEANING_TASKS,
  SAMPLE_RESERVATIONS,
  SAMPLE_UNITS,
} from "./sample-data";

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

// Limiar de risco do semáforo — valor FIXO DE EXEMPLO (2h), não aprendido de histórico. Uma fase
// futura (seção 9.8.8, roteamento/otimização de virada — explicitamente CORTADA desta fase)
// substituiria isto por um tempo-padrão aprendido por unidade/tipo de virada.
const RISK_THRESHOLD_MS = 2 * HOUR_MS;
const RISK_THRESHOLD_LABEL = "2h";

// `reservations.stay` (packages/db/src/schema/reservation.ts) é `daterange` de DATAS CIVIS, sem
// componente de hora — não existe "hora oficial de check-in/check-out" modelada em nenhuma
// tabela ainda (bounded context `inventory`, fora do escopo desta faixa). Os horários abaixo são
// convenção de mercado usada só para estimar um instante a partir da data civil — documentado como
// estimativa, nunca dado oficial. Sem tratamento de fuso horário (America/Sao_Paulo) aqui: os
// epochs usam Z (UTC) por simplicidade de amostra, mesmo padrão determinístico do restante do
// cockpit (apps/console/app/(staff)/distribuicao/sample-data.ts).
const STANDARD_CHECKOUT_HOUR_UTC = "11:00:00Z";
const STANDARD_CHECKIN_HOUR_UTC = "15:00:00Z";

const RELEVANT_STATUSES = ["dirty", "cleaning", "clean", "inspected", "rework"] as const;
type RelevantUnitStatus = (typeof RELEVANT_STATUSES)[number];

function isRelevantStatus(status: string): status is RelevantUnitStatus {
  return (RELEVANT_STATUSES as readonly string[]).includes(status);
}

/** Inverso de `daterangeLiteral` de apps/console/app/(staff)/reservas/nova/actions.ts — não
 * importado dali (não é dependência declarada desta faixa; a lógica é trivial o bastante para
 * replicar, mesmo raciocínio já usado naquele arquivo para não depender do seed). Postgres
 * CANONICALIZA `daterange` para a forma "[lower,upper)" em toda leitura, então este parser simples
 * é seguro para qualquer linha vinda do banco. */
function parseCivilStay(literal: string): { checkinISO: string; checkoutISO: string } {
  const match = /^\[([^,]+),([^)]+)\)$/.exec(literal);
  if (!match) {
    throw new Error(`daterange em formato inesperado: "${literal}".`);
  }
  const [, checkinISO, checkoutISO] = match;
  return { checkinISO: checkinISO!, checkoutISO: checkoutISO! };
}

function checkoutEpochOf(reservation: (typeof SAMPLE_RESERVATIONS)[number]): number {
  const { checkoutISO } = parseCivilStay(reservation.stay);
  return Date.parse(`${checkoutISO}T${STANDARD_CHECKOUT_HOUR_UTC}`);
}

function checkinEpochOf(reservation: (typeof SAMPLE_RESERVATIONS)[number]): number {
  const { checkinISO } = parseCivilStay(reservation.stay);
  return Date.parse(`${checkinISO}T${STANDARD_CHECKIN_HOUR_UTC}`);
}

/** Última reserva confirmada cujo checkout estimado já passou — "a estadia que deixou a unidade
 * suja". `null` se não houver nenhuma na amostra (documentado no rótulo exibido, nunca escondido). */
function findLastCheckoutEpoch(unitId: string, nowEpochMs: number): number | null {
  const pastCheckouts = SAMPLE_RESERVATIONS.filter(
    (r) => r.unitId === unitId && r.status === "confirmed" && checkoutEpochOf(r) <= nowEpochMs,
  ).map(checkoutEpochOf);
  return pastCheckouts.length > 0 ? Math.max(...pastCheckouts) : null;
}

/** Próxima reserva confirmada com check-in estimado ainda por vir. `null` se não houver nenhuma. */
function findNextCheckinEpoch(unitId: string, nowEpochMs: number): number | null {
  const futureCheckins = SAMPLE_RESERVATIONS.filter(
    (r) => r.unitId === unitId && r.status === "confirmed" && checkinEpochOf(r) > nowEpochMs,
  ).map(checkinEpochOf);
  return futureCheckins.length > 0 ? Math.min(...futureCheckins) : null;
}

const DATETIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / MINUTE_MS);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function buildCard(unit: (typeof SAMPLE_UNITS)[number], nowEpochMs: number): CleaningBoardCard | null {
  if (!isRelevantStatus(unit.status)) {
    return null;
  }

  const task = SAMPLE_CLEANING_TASKS.find((t) => t.unitId === unit.id) ?? null;

  const lastCheckoutEpoch = findLastCheckoutEpoch(unit.id, nowEpochMs);
  const checkoutLabel =
    lastCheckoutEpoch !== null
      ? `${DATETIME_FORMATTER.format(new Date(lastCheckoutEpoch))} (estimado)`
      : "Sem checkout registrado nesta amostra.";

  const nextCheckinEpoch = findNextCheckinEpoch(unit.id, nowEpochMs);
  let countdownLabel: string;
  let risk: boolean;
  if (nextCheckinEpoch === null) {
    countdownLabel = "Sem próxima reserva confirmada.";
    risk = false;
  } else {
    const remainingMs = nextCheckinEpoch - nowEpochMs;
    countdownLabel = `${formatDuration(remainingMs)} até o próximo check-in (estimado)`;
    risk = remainingMs < RISK_THRESHOLD_MS;
  }

  return {
    unitId: unit.id,
    unitName: unit.name,
    unitStatus: unit.status,
    cleaningTaskId: task?.id ?? null,
    assignedTo: task?.assignedTo ?? null,
    scorePercent: task?.scorePercent ?? null,
    passed: task?.passed ?? null,
    elapsedLabel: task ? formatDuration(nowEpochMs - task.startedAt.getTime()) : null,
    checkoutLabel,
    countdownLabel,
    risk,
  };
}

export default function LimpezaPage() {
  const nowEpochMs = NOW_ANCHOR_EPOCH_MS; // mesma âncora determinística da amostra.

  const cards = SAMPLE_UNITS.map((unit) => buildCard(unit, nowEpochMs)).filter(
    (card): card is CleaningBoardCard => card !== null,
  );

  const dirtyCount = cards.filter((c) => c.unitStatus === "dirty").length;
  const cleaningCount = cards.filter((c) => c.unitStatus === "cleaning").length;
  const awaitingInspectionCount = cards.filter((c) => c.unitStatus === "clean").length;
  const reworkCount = cards.filter((c) => c.unitStatus === "rework").length;

  return (
    <div className="p-6">
      <PageHeader
        title="Limpeza"
        description="Quadro do dia — unidades por estado de virada (I9). Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />
      {/* 4 KPI cards (máximo por linha, DESIGN.md §5) — "inspected" não ganha card próprio: é um
          estado de passagem rápida rumo a "ready" (docs/domain/modelo-dominio.md §2), então uma
          contagem dedicada tenderia a ficar sempre baixa/zero e menos acionável que "Em rework",
          que sinaliza problema real precisando de atenção do turno. */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sujas" value={String(dirtyCount)} trend={dirtyCount > 0 ? "down" : "flat"} />
        <KpiCard label="Em limpeza" value={String(cleaningCount)} />
        <KpiCard label="Aguardando inspeção" value={String(awaitingInspectionCount)} />
        <KpiCard label="Em rework" value={String(reworkCount)} trend={reworkCount > 0 ? "down" : "flat"} />
      </div>

      <CleaningBoard cards={cards} riskThresholdLabel={RISK_THRESHOLD_LABEL} />
    </div>
  );
}
