import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function PortalFiscalPage() {
  return (
    <div className="p-6">
      <PageHeader title="Fiscal" description="Notas fiscais emitidas para suas reservas." />
      <EmptyState message="Nenhuma nota fiscal disponível ainda." />
    </div>
  );
}
