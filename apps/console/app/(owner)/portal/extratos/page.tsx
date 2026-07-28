// Extratos de repasse ao proprietário (Fase 5, Passo 4c — docs/fase-atual.md). Reescreve o
// placeholder da Fase 1 (só `EmptyState`) por uma listagem real de `payout_batches`.
//
// Dados exibidos são AMOSTRA ESTÁTICA (../sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), então esta página Server
// Component não consulta `packages/db` para LER ainda — mesmo padrão de
// apps/console/app/(staff)/fiscal/page.tsx e .../distribuicao/page.tsx. As linhas abaixo são,
// ainda assim, CALCULADAS de verdade sobre a amostra com a MESMA lógica de domínio que uma query
// real usaria (`resolveAdministrationContractForDate` via ../helpers.ts, nunca um "modelo padrão"
// inventado) — trocar a fonte por `../queries.ts::getOwnerPayoutBatches()` (já real, só não
// exercitada nesta sessão) é a única mudança necessária quando o banco estiver de pé, nunca a
// lógica de resolução do modelo de despesa.
//
// Nada de geração de PDF real nesta fase — TODO explícito, adiável (é formatação, não modelo de
// dados novo).
import { KpiCard, StatusPill } from "@titan/ui";
import { format, money } from "@titan/money";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { resolveItemPaymentModelForBatch, formatPeriod, statusLabel, statusTone } from "../helpers";
import { SAMPLE_ADMINISTRATION_CONTRACTS, SAMPLE_OWNER_UNITS, SAMPLE_PAYOUT_BATCHES } from "../sample-data";

const SENT_STATUS = "sent";
const PENDING_STATUSES = new Set(["draft", "pending_approval", "approved"]);

function unitName(unitId: string): string {
  return SAMPLE_OWNER_UNITS.find((unit) => unit.id === unitId)?.name ?? "Unidade desconhecida";
}

export default function PortalExtratosPage() {
  const batches = [...SAMPLE_PAYOUT_BATCHES].sort((a, b) => b.periodStart.localeCompare(a.periodStart));

  const totalSentCents = SAMPLE_PAYOUT_BATCHES.filter((b) => b.status === SENT_STATUS).reduce(
    (sum, b) => sum + b.netAmountCents,
    0,
  );
  const totalPendingCents = SAMPLE_PAYOUT_BATCHES.filter((b) => PENDING_STATUSES.has(b.status)).reduce(
    (sum, b) => sum + b.netAmountCents,
    0,
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Extratos"
        description="Extratos de repasse por período, unidade e status. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Extratos no período" value={String(batches.length)} />
        <KpiCard label="Total repassado" value={format(money(totalSentCents, "BRL"))} />
        <KpiCard
          label="Total pendente"
          value={format(money(totalPendingCents, "BRL"))}
          state={totalPendingCents > 0 ? "ready" : "empty"}
          trend={totalPendingCents > 0 ? "down" : "flat"}
        />
      </div>

      {batches.length === 0 ? (
        <EmptyState message="Nenhum extrato disponível ainda." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-label text-fg-muted">
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Período</th>
                <th className="px-4 py-3 font-medium">Receita bruta</th>
                <th className="px-4 py-3 font-medium">Comissão</th>
                <th className="px-4 py-3 font-medium">Despesas</th>
                <th className="px-4 py-3 font-medium">Líquido</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((batch) => {
                const itemPaymentModel = resolveItemPaymentModelForBatch(batch, SAMPLE_ADMINISTRATION_CONTRACTS);
                // Coluna de despesas é sempre exibida (evita tabela com colunas variáveis por
                // linha) — o VALOR muda conforme o contrato de administração da unidade:
                // "owner_pays_itemized" mostra o total rateado deste período; "titan_pays_all"
                // mostra que já está embutido na comissão; contrato ausente/ambíguo mostra alerta
                // de cadastro em vez de assumir um modelo em silêncio.
                const expensesCell =
                  itemPaymentModel === "owner_pays_itemized" ? (
                    <span className="tabular-figures">{format(money(batch.expensesAmountCents, "BRL"))}</span>
                  ) : itemPaymentModel === "titan_pays_all" ? (
                    <span className="text-fg-muted">Incluído na comissão</span>
                  ) : (
                    <StatusPill tone="warning">Contrato não cadastrado</StatusPill>
                  );

                return (
                  <tr key={batch.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3">{unitName(batch.unitId)}</td>
                    <td className="px-4 py-3 tabular-figures">{formatPeriod(batch.periodStart, batch.periodEnd)}</td>
                    <td className="px-4 py-3 tabular-figures">{format(money(batch.grossAmountCents, "BRL"))}</td>
                    <td className="px-4 py-3 tabular-figures">{format(money(batch.commissionAmountCents, "BRL"))}</td>
                    <td className="px-4 py-3 tabular-figures">{expensesCell}</td>
                    <td className="px-4 py-3 tabular-figures font-medium text-fg">
                      {format(money(batch.netAmountCents, "BRL"))}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill tone={statusTone(batch.status)}>{statusLabel(batch.status)}</StatusPill>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
