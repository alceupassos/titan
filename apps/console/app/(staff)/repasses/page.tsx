// Repasses ao proprietário (Fase 5, Passo 4b — docs/fase-atual.md; seção 9.4.1 do prompt único).
// Fechamento por proprietário, apuração de lote, dupla aprovação + step-up acima de R$ 5.000
// (docs/decisoes-de-negocio.md, pergunta 5).
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), então esta página Server
// Component não consulta `packages/db` para LER a lista ainda. O caminho de ESCRITA
// (createPayoutBatchAction/submitPayoutBatchForApprovalAction/approvePayoutBatchAction,
// ./actions.ts, chamado por ./PayoutBatchList.tsx) já é real, contra o banco via `withTenant` —
// mesma distinção já documentada em apps/console/app/(staff)/aprovacoes/page.tsx. Quando a
// leitura ganhar dado real, troca-se `SAMPLE_PAYOUT_BATCHES` por
// `withTenant(...).select().from(payoutBatches)`, sem tocar em ./actions.ts.
import { KpiCard } from "@titan/ui";
import { format, money } from "@titan/money";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PayoutBatchList } from "./PayoutBatchList";
import { SAMPLE_PAYOUT_BATCHES } from "./sample-data";

export default function RepassesPage() {
  const batches = SAMPLE_PAYOUT_BATCHES;
  const pendingBatches = batches.filter(
    (batch) => batch.status === "draft" || batch.status === "pending_approval",
  );
  const currentBatchTotalCents = pendingBatches.reduce((sum, batch) => sum + batch.netAmountCents, 0);

  // "Proprietários aguardando": nenhum bounded context `identity`/`organization` mapeia unidade ->
  // proprietário ainda (mesma lacuna documentada em apps/console/lib/auth/session.ts) — usamos
  // contagem de UNIDADES distintas com lote pendente como proxy, documentado explicitamente como
  // aproximação, não a contagem real de proprietários (uma unidade só tem um proprietário nesta
  // fase, então o número tende a coincidir, mas o rótulo é sobre unidade, não sobre pessoa).
  const distinctUnitsAwaiting = new Set(pendingBatches.map((batch) => batch.unitId)).size;

  const lastClosedBatch = batches
    .filter((batch) => batch.status === "approved" || batch.status === "sent")
    .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))[0];

  return (
    <div className="p-6">
      <PageHeader
        title="Repasses"
        description="Fechamento por proprietário, dupla aprovação com step-up acima de R$ 5.000 (docs/decisoes-de-negocio.md, pergunta 5). Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Repasses pendentes" value={String(pendingBatches.length)} />
        <KpiCard
          label="Total em aberto"
          value={pendingBatches.length > 0 ? format(money(currentBatchTotalCents, "BRL")) : "—"}
          state={pendingBatches.length > 0 ? "ready" : "empty"}
        />
        <KpiCard label="Unidades aguardando" value={String(distinctUnitsAwaiting)} />
        <KpiCard
          label="Último fechamento"
          value={lastClosedBatch ? lastClosedBatch.unitName : "—"}
          state={lastClosedBatch ? "ready" : "empty"}
        />
      </div>
      {batches.length > 0 ? (
        <PayoutBatchList batches={batches} />
      ) : (
        <EmptyState message="Nenhum lote de repasse apurado ainda." />
      )}
    </div>
  );
}
