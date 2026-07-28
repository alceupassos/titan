// Extrato de pagamentos — Portal do Prestador (Fase 7, Passo 4a — docs/fase-atual.md, seção
// 9.10.3 do prompt único). Mesmo princípio de transparência do extrato do Owner Portal
// (apps/console/app/(owner)/portal/extratos/page.tsx): nunca esconder o cálculo — cada retenção
// (INSS/IRRF/CSRF/ISS) aparece como coluna própria ao lado do bruto e do líquido, nunca só um
// valor final sem detalhamento.
//
// Dados exibidos são AMOSTRA ESTÁTICA (../sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md); trocar a fonte por
// `../queries.ts::getVendorPayments(vendorId)` (já real, só não exercitada nesta sessão) é a única
// mudança necessária quando o banco estiver de pé.
import { KpiCard, StatusPill } from "@titan/ui";
import { format, money } from "@titan/money";
import type { VendorRetentionAmounts } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SAMPLE_VENDOR_PAYMENTS, UNIT_LABEL } from "../sample-data";

const DUE_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatDueDate(value: string): string {
  // Parse como UTC-meio-dia para nunca cair no dia anterior por fuso — mesma cautela de
  // apps/console/app/(owner)/portal/helpers.ts::formatCivilDate.
  return DUE_DATE_FORMATTER.format(new Date(`${value}T00:00:00Z`));
}

function isVendorRetentionAmounts(value: unknown): value is VendorRetentionAmounts {
  return (
    typeof value === "object" &&
    value !== null &&
    "inssCents" in value &&
    "irrfCents" in value &&
    "csrfCents" in value &&
    "issCents" in value &&
    "netCents" in value
  );
}

export default function PortalPrestadorPagamentosPage() {
  const payments = [...SAMPLE_VENDOR_PAYMENTS]
    .filter((payment) => payment.status === "paid")
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));

  const totalGrossCents = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  const totalNetCents = payments.reduce((sum, payment) => {
    const breakdown = isVendorRetentionAmounts(payment.retentionBreakdown) ? payment.retentionBreakdown : undefined;
    return sum + (breakdown?.netCents ?? payment.amountCents);
  }, 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Pagamentos"
        description="Pagamentos recebidos, com o detalhamento completo de retenção. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Pagamentos recebidos" value={String(payments.length)} />
        <KpiCard label="Total bruto" value={format(money(totalGrossCents, "BRL"))} />
        <KpiCard
          label="Total líquido"
          value={format(money(totalNetCents, "BRL"))}
          state={totalNetCents > 0 ? "ready" : "empty"}
        />
      </div>

      {payments.length === 0 ? (
        <EmptyState message="Nenhum pagamento recebido ainda." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-label text-fg-muted">
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Vencimento</th>
                <th className="px-4 py-3 font-medium">Bruto</th>
                <th className="px-4 py-3 font-medium">INSS</th>
                <th className="px-4 py-3 font-medium">IRRF</th>
                <th className="px-4 py-3 font-medium">CSRF</th>
                <th className="px-4 py-3 font-medium">ISS</th>
                <th className="px-4 py-3 font-medium">Líquido</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => {
                const breakdown = isVendorRetentionAmounts(payment.retentionBreakdown)
                  ? payment.retentionBreakdown
                  : undefined;

                return (
                  <tr key={payment.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3 align-top">
                      {payment.unitId ? UNIT_LABEL[payment.unitId] ?? payment.unitId : "—"}
                    </td>
                    <td className="px-4 py-3 align-top max-w-xs text-fg-muted">{payment.description}</td>
                    <td className="px-4 py-3 align-top tabular-figures">{formatDueDate(payment.dueDate)}</td>
                    <td className="px-4 py-3 align-top tabular-figures font-medium text-fg">
                      {format(money(payment.amountCents, "BRL"))}
                    </td>
                    {breakdown ? (
                      <>
                        <td className="px-4 py-3 align-top tabular-figures">{format(money(breakdown.inssCents, "BRL"))}</td>
                        <td className="px-4 py-3 align-top tabular-figures">{format(money(breakdown.irrfCents, "BRL"))}</td>
                        <td className="px-4 py-3 align-top tabular-figures">{format(money(breakdown.csrfCents, "BRL"))}</td>
                        <td className="px-4 py-3 align-top tabular-figures">{format(money(breakdown.issCents, "BRL"))}</td>
                        <td className="px-4 py-3 align-top tabular-figures font-medium text-fg">
                          {format(money(breakdown.netCents, "BRL"))}
                        </td>
                      </>
                    ) : (
                      <td colSpan={5} className="px-4 py-3 align-top">
                        <StatusPill tone="warning">Retenção não registrada</StatusPill>
                      </td>
                    )}
                    <td className="px-4 py-3 align-top">
                      <StatusPill tone="positive">Pago</StatusPill>
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
