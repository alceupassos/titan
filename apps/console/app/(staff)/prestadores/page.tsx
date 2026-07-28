// Cadastro de prestadores (Fase 7, Passo 4b — docs/fase-atual.md; seção 9.10.3-9.10.4 do prompt
// único). Reescreve o placeholder da Fase 1 (só `EmptyState`) por uma listagem real.
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), mesmo padrão de
// apps/console/app/(staff)/financeiro/page.tsx e .../repasses/page.tsx. O CAMINHO DE ESCRITA
// (`updateVendorProfileAction`/`rateVendorAfterWorkOrderAction`/`payVendorInvoiceAction`,
// ./actions.ts, chamados a partir de ./[id]/VendorDetail.tsx) já é real, contra o banco via
// `withTenant`.
import Link from "next/link";
import { KpiCard, StatusPill, type StatusTone } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SAMPLE_VENDOR_PROFILES, type VendorComplianceStatusSample, type VendorTaxRegimeSample } from "./sample-data";

const TAX_REGIME_LABEL: Record<VendorTaxRegimeSample, string> = {
  pj_cessao_mao_obra: "PJ — cessão de mão de obra",
  pj_simples: "PJ — Simples Nacional",
  pf_autonomo: "PF — autônomo",
};

const COMPLIANCE_LABEL: Record<VendorComplianceStatusSample, string> = {
  pending: "Pendente",
  compliant: "Conforme",
  non_compliant: "Não conforme",
};

const COMPLIANCE_TONE: Record<VendorComplianceStatusSample, StatusTone> = {
  pending: "warning",
  compliant: "positive",
  non_compliant: "negative",
};

function formatRating(basisPoints: number | undefined): string {
  if (basisPoints === undefined) return "Sem avaliação";
  return `${(basisPoints / 100).toFixed(2).replace(".", ",")} ★`;
}

export default function PrestadoresPage() {
  const vendors = SAMPLE_VENDOR_PROFILES;
  const pendingCompliance = vendors.filter((vendor) => vendor.complianceStatus !== "compliant").length;
  const rated = vendors.filter((vendor) => vendor.ratingAvgBasisPoints !== undefined);
  const avgRatingBasisPoints =
    rated.length > 0
      ? Math.round(rated.reduce((sum, vendor) => sum + (vendor.ratingAvgBasisPoints ?? 0), 0) / rated.length)
      : undefined;

  return (
    <div className="p-6">
      <PageHeader
        title="Prestadores"
        description="Cadastro, regime fiscal, compliance, scorecard e pagamento com retenção. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Prestadores cadastrados" value={String(vendors.length)} />
        <KpiCard
          label="Pendentes de compliance"
          value={String(pendingCompliance)}
          trend={pendingCompliance > 0 ? "down" : "flat"}
        />
        <KpiCard
          label="Nota média geral"
          value={avgRatingBasisPoints !== undefined ? formatRating(avgRatingBasisPoints) : "—"}
          state={avgRatingBasisPoints !== undefined ? "ready" : "empty"}
        />
      </div>

      {vendors.length === 0 ? (
        <EmptyState message="Nenhum prestador cadastrado ainda." />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-label text-fg-muted">
                <th className="px-4 py-3 font-medium">Nome</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Regime fiscal</th>
                <th className="px-4 py-3 font-medium">Compliance</th>
                <th className="px-4 py-3 font-medium">Nota média</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <Link href={`/prestadores/${vendor.id}`} className="text-fg underline-offset-2 hover:underline">
                      {vendor.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-fg-muted">{vendor.category}</td>
                  <td className="px-4 py-3">
                    {vendor.taxRegime ? (
                      TAX_REGIME_LABEL[vendor.taxRegime]
                    ) : (
                      <StatusPill tone="warning">Sem regime cadastrado</StatusPill>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill tone={COMPLIANCE_TONE[vendor.complianceStatus]}>
                      {COMPLIANCE_LABEL[vendor.complianceStatus]}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 tabular-figures">{formatRating(vendor.ratingAvgBasisPoints)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
