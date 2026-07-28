// "Minhas OS" — Portal do Prestador (Fase 7, Passo 4a — docs/fase-atual.md, seção 9.10.2 do
// prompt único). Server Component — KPI cards (a fazer/em execução/concluídas no mês) + lista com
// transição de estado restrita ao próprio prestador, mostrando só a AÇÃO ÚNICA válida para o
// estado atual de cada OS (nunca um conjunto fixo de botões — `nextVendorAction`, ./status.ts, que
// por sua vez reconfirma com `canTransitionWorkOrder`, packages/domain/src/work-order/state-machine.ts).
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), mesmo padrão de
// apps/console/app/(staff)/limpeza/servicos/page.tsx. O CAMINHO DE ESCRITA
// (`vendorTransitionWorkOrderAction`, ./actions.ts, chamado por ./VendorWorkOrderList.tsx) já é
// real, contra o banco via `withTenant`. O CAMINHO DE LEITURA real (`getVendorWorkOrders`,
// ./queries.ts) também já é real, só não exercitado nesta sessão.
import { KpiCard } from "@titan/ui";
import type { WorkOrderStatus } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { VendorWorkOrderList } from "./VendorWorkOrderList";
import { SAMPLE_VENDOR_WORK_ORDERS } from "./sample-data";

// Mesma âncora determinística do resto do preview — "mês corrente" é o mês desta data, nunca
// `new Date()` (preview tem que renderizar sempre igual).
const NOW_ANCHOR = new Date(Date.parse("2026-07-28T14:00:00Z"));

function isSameMonth(date: Date, reference: Date): boolean {
  return date.getUTCFullYear() === reference.getUTCFullYear() && date.getUTCMonth() === reference.getUTCMonth();
}

// "A fazer" = ainda não iniciou execução (despachada ou aceita, aguardando início); "em execução"
// = executando ou em retrabalho; "concluídas" = qualquer estado a partir do aceite da Titan em
// diante — mesma leitura de docs/domain/modelo-dominio.md usada pelo painel de staff
// (.../limpeza/servicos/page.tsx), restrita ao vocabulário relevante para o prestador.
const TODO_STATUSES: readonly WorkOrderStatus[] = ["dispatched", "accepted_vendor"];
const EXECUTING_STATUSES: readonly WorkOrderStatus[] = ["executing", "rework"];
const CONCLUDED_STATUSES: readonly WorkOrderStatus[] = ["accepted_titan", "billed", "paid", "rated"];

export default function PortalPrestadorMinhasOsPage() {
  const todo = SAMPLE_VENDOR_WORK_ORDERS.filter((wo) => TODO_STATUSES.includes(wo.status as WorkOrderStatus));
  const executing = SAMPLE_VENDOR_WORK_ORDERS.filter((wo) =>
    EXECUTING_STATUSES.includes(wo.status as WorkOrderStatus),
  );
  const concludedThisMonth = SAMPLE_VENDOR_WORK_ORDERS.filter(
    (wo) => CONCLUDED_STATUSES.includes(wo.status as WorkOrderStatus) && isSameMonth(wo.updatedAt, NOW_ANCHOR),
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Minhas OS"
        description="Ordens de serviço atribuídas a você. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="A fazer" value={String(todo.length)} trend={todo.length > 0 ? "down" : "flat"} />
        <KpiCard label="Em execução" value={String(executing.length)} trend="flat" />
        <KpiCard
          label="Concluídas no mês"
          value={String(concludedThisMonth.length)}
          state={concludedThisMonth.length > 0 ? "ready" : "empty"}
        />
      </div>

      {SAMPLE_VENDOR_WORK_ORDERS.length === 0 ? (
        <EmptyState message="Nenhuma ordem de serviço atribuída a você ainda." />
      ) : (
        <VendorWorkOrderList workOrders={SAMPLE_VENDOR_WORK_ORDERS} />
      )}
    </div>
  );
}
