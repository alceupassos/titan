// Detalhe do prestador (Fase 7, Passo 4b — docs/fase-atual.md). Reescreve o placeholder da Fase 1
// (só `DetailPlaceholder`) por um formulário/fila reais.
//
// Dados exibidos são AMOSTRA ESTÁTICA (../sample-data.ts) — mesmo padrão de ../page.tsx e dos
// irmãos desta fase (Gap conhecido 2, docs/fase-atual.md). O CAMINHO DE ESCRITA
// (`updateVendorProfileAction`/`rateVendorAfterWorkOrderAction`/`payVendorInvoiceAction`,
// ../actions.ts, chamados por ./VendorDetail.tsx) já é real, contra o banco via `withTenant`.
import { PageHeader } from "@/components/PageHeader";
import { VendorDetail } from "./VendorDetail";
import {
  SAMPLE_VENDOR_ACCOUNTS_PAYABLE,
  SAMPLE_VENDOR_PROFILES,
  SAMPLE_VENDOR_RETENTION_RULES,
  SAMPLE_VENDOR_WORK_ORDERS,
} from "../sample-data";

export default async function PrestadorDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = SAMPLE_VENDOR_PROFILES.find((candidate) => candidate.id === id);

  if (!vendor) {
    return (
      <div className="p-6">
        <PageHeader title="Prestador" description="Cadastro, certidões, scorecard, ordens de serviço." />
        <div className="rounded-card border border-border bg-surface p-8 text-sm text-fg-muted">
          Prestador <span className="tabular-figures text-fg">{id}</span> não encontrado na amostra
          desta fase (./sample-data.ts) — abra a partir da lista em <code>/prestadores</code>.
        </div>
      </div>
    );
  }

  const pendingAccountsPayable = SAMPLE_VENDOR_ACCOUNTS_PAYABLE.filter(
    (item) => item.vendorId === vendor.id && item.status !== "paid",
  );
  const workOrders = SAMPLE_VENDOR_WORK_ORDERS.filter((item) => item.vendorId === vendor.id);

  return (
    <div className="p-6">
      <PageHeader
        title={vendor.name}
        description="Cadastro, regime fiscal, compliance, scorecard e ordens de serviço."
      />
      <VendorDetail
        vendor={vendor}
        pendingAccountsPayable={pendingAccountsPayable}
        workOrders={workOrders}
        retentionRules={SAMPLE_VENDOR_RETENTION_RULES}
      />
    </div>
  );
}
