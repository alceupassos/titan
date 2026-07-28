// Cockpit fiscal (Fase 4, Passo 4c — docs/fase-atual.md; seção 9.6 do prompt único: fila de
// emissão, rejeições, cancelamento — I7: documento fiscal emitido nunca é editado, só cancelado/
// substituído). O cofre WORM real (servir o binário de `xmlStorageRef`/`pdfStorageRef`) é o Passo
// 5, faixa paralela — fora de escopo aqui, que só expõe a referência/link.
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), então esta página Server
// Component não consulta `packages/db` para LER ainda — mesmo padrão de
// apps/console/app/(staff)/distribuicao/page.tsx. As contagens dos KPI cards abaixo são, ainda
// assim, CALCULADAS de verdade sobre a amostra (não são "0" hardcoded) com a MESMA lógica que uma
// query real usaria (filtrar por status, somar centavos, comparar mês/ano de `issuedAt`) — trocar
// a fonte por `withTenant(...).select()...` quando o banco estiver de pé é a única mudança
// necessária, nunca a lógica de agregação.
//
// O CAMINHO DE ESCRITA (`retryInvoiceIssuanceAction`, `cancelInvoiceAction` — ./actions.ts,
// chamados por ./FiscalDocumentList.tsx) já é real, contra o banco via `withTenant` — resolver
// reprocessar/cancelar aqui não é mock, é a Server Action de verdade que só não encontra a linha
// porque o banco não está de pé nesta sessão.
import { KpiCard } from "@titan/ui";
import { format, money } from "@titan/money";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { FiscalDocumentList } from "./FiscalDocumentList";
import { SAMPLE_FISCAL_DOCUMENTS } from "./sample-data";

// Mesma âncora determinística de ./sample-data.ts — "mês corrente" para o KPI card de emissão/ISS
// é o mês desta data, não `new Date()` (preview tem que renderizar sempre igual).
const NOW_ANCHOR = new Date(Date.parse("2026-07-28T14:00:00Z"));

function isSameMonth(date: Date, reference: Date): boolean {
  return date.getUTCFullYear() === reference.getUTCFullYear() && date.getUTCMonth() === reference.getUTCMonth();
}

export default function FiscalPage() {
  const pending = SAMPLE_FISCAL_DOCUMENTS.filter((doc) => doc.status === "pending");
  const rejected = SAMPLE_FISCAL_DOCUMENTS.filter((doc) => doc.status === "rejected");
  const issuedThisMonth = SAMPLE_FISCAL_DOCUMENTS.filter(
    (doc) => doc.status === "issued" && doc.issuedAt !== null && isSameMonth(doc.issuedAt, NOW_ANCHOR),
  );
  const issTotalThisMonthCents = issuedThisMonth.reduce((sum, doc) => sum + doc.taxAmountCents, 0);

  const actionable = SAMPLE_FISCAL_DOCUMENTS.filter(
    (doc) => doc.status === "pending" || doc.status === "rejected" || doc.status === "issued",
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Fiscal"
        description="Fila de emissão, rejeições, cofre, apuração. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Notas pendentes"
          value={String(pending.length)}
          trend={pending.length > 0 ? "down" : "flat"}
        />
        <KpiCard
          label="Notas rejeitadas"
          value={String(rejected.length)}
          trend={rejected.length > 0 ? "down" : "flat"}
        />
        <KpiCard label="Notas emitidas (mês)" value={String(issuedThisMonth.length)} />
        <KpiCard
          label="ISS apurado (mês)"
          value={format(money(issTotalThisMonthCents, "BRL"))}
          state={issuedThisMonth.length > 0 ? "ready" : "empty"}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Documentos fiscais</h2>
        {actionable.length > 0 ? (
          <FiscalDocumentList documents={SAMPLE_FISCAL_DOCUMENTS} />
        ) : (
          <EmptyState message="Nenhum documento fiscal ainda." />
        )}
      </div>
    </div>
  );
}
