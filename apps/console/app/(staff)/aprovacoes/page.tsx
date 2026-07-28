// Fila central de aprovações (Fase 2, Passo 4 — docs/fase-atual.md; seção 9.4.2 do prompt único):
// nenhum valor monetário ou consequência fiscal é decidido por botão de chat/telegram
// (anti-padrão #15) — esta tela é o controle interno real.
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), então esta página Server
// Component não consulta `packages/db` para LER a fila ainda. O caminho de ESCRITA
// (`decideApprovalAction`, ./actions.ts, chamado por ./ApprovalQueueTable.tsx) já é real, contra o
// banco via `withTenant` — a distinção importa: aprovar/rejeitar aqui não é um mock, é a Server
// Action de verdade que só não encontra a linha porque o banco não está de pé nesta sessão. Quando
// a leitura ganhar dado real, troca-se `SAMPLE_APPROVAL_REQUESTS` por
// `withTenant(...).select().from(approvalRequests).where(eq(status, "pending"))`, sem tocar em
// ./actions.ts.
import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ApprovalQueueTable } from "./ApprovalQueueTable";
import { SAMPLE_APPROVAL_REQUESTS } from "./sample-data";

export default function AprovacoesPage() {
  const pending = SAMPLE_APPROVAL_REQUESTS.filter((request) => request.status === "pending");
  const highRiskPending = pending.filter((request) => request.risk === "high").length;

  return (
    <div className="p-6">
      <PageHeader
        title="Aprovações"
        description="Fila central de aprovações — repasse, OS, reembolso, ajuste de estoque. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Aprovações pendentes" value={String(pending.length)} />
        <KpiCard label="Risco alto pendente" value={String(highRiskPending)} trend={highRiskPending > 0 ? "down" : "flat"} />
      </div>
      {pending.length > 0 ? (
        <ApprovalQueueTable requests={pending} />
      ) : (
        <EmptyState message="Nenhuma aprovação pendente." />
      )}
    </div>
  );
}
