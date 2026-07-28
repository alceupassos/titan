// Fila de OS técnica (Fase 6, Passo 4c — docs/fase-atual.md, seção 9.10.2 do prompt único). Server
// Component — KPI cards (abertas/em execução/concluídas no mês) + lista com transição de estado,
// mostrando só os PRÓXIMOS ESTADOS VÁLIDOS da FSM para cada OS (nunca todos os 11 estados soltos —
// `canTransitionWorkOrder`, packages/domain/src/work-order/state-machine.ts, é o árbitro).
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), mesmo padrão de
// apps/console/app/(staff)/fiscal/page.tsx. O CAMINHO DE ESCRITA (`openWorkOrderAction`,
// `transitionWorkOrderAction`, ./actions.ts, chamados por ./WorkOrderList.tsx) já é real, contra o
// banco via `withTenant`.
import { KpiCard } from "@titan/ui";
import type { WorkOrderStatus } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { WorkOrderList } from "./WorkOrderList";
import { SAMPLE_WORK_ORDERS } from "./sample-data";

// "Concluídas no mês" usa `updatedAt` como proxy de data de conclusão — `work_orders`
// (packages/db/src/schema/work-order.ts) não tem uma coluna `completedAt` própria nesta fase
// (fora do escopo desta faixa, que não toca `packages/db`). Documentado, não escondido.
const NOW_ANCHOR = new Date(Date.parse("2026-07-28T14:00:00Z"));

function isSameMonth(date: Date, reference: Date): boolean {
  return date.getUTCFullYear() === reference.getUTCFullYear() && date.getUTCMonth() === reference.getUTCMonth();
}

// "Abertas" = ainda não entrou em execução; "em execução" = executando ou em rework (voltou para
// nova rodada de execução); "concluída" = qualquer estado terminal/pós-execução do lado da Titan
// em diante (accepted_titan/billed/paid/rated) — mesma leitura de `docs/domain/modelo-dominio.md`
// (seção 2 do state-machine.ts do work-order).
const OPEN_STATUSES: readonly WorkOrderStatus[] = ["opened", "triage", "budget", "dispatched", "accepted_vendor"];
const EXECUTING_STATUSES: readonly WorkOrderStatus[] = ["executing", "rework"];
const CONCLUDED_STATUSES: readonly WorkOrderStatus[] = ["accepted_titan", "billed", "paid", "rated"];

export default function ServicosLimpezaPage() {
  const open = SAMPLE_WORK_ORDERS.filter((wo) => OPEN_STATUSES.includes(wo.status as WorkOrderStatus));
  const executing = SAMPLE_WORK_ORDERS.filter((wo) => EXECUTING_STATUSES.includes(wo.status as WorkOrderStatus));
  const concludedThisMonth = SAMPLE_WORK_ORDERS.filter(
    (wo) => CONCLUDED_STATUSES.includes(wo.status as WorkOrderStatus) && isSameMonth(wo.updatedAt, NOW_ANCHOR),
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Serviços técnicos"
        description="Ordens de serviço técnicas e laudos. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="OS abertas" value={String(open.length)} trend={open.length > 0 ? "down" : "flat"} />
        <KpiCard label="Em execução" value={String(executing.length)} trend="flat" />
        <KpiCard
          label="Concluídas no mês"
          value={String(concludedThisMonth.length)}
          state={concludedThisMonth.length > 0 ? "ready" : "empty"}
        />
      </div>

      {SAMPLE_WORK_ORDERS.length === 0 ? (
        <EmptyState message="Nenhuma ordem de serviço técnica registrada." />
      ) : (
        <WorkOrderList workOrders={SAMPLE_WORK_ORDERS} />
      )}
    </div>
  );
}
