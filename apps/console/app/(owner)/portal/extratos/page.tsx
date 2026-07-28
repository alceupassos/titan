import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function PortalExtratosPage() {
  return (
    <div className="p-6">
      <PageHeader title="Extratos" description="Extratos de repasse por período." />
      <EmptyState message="Nenhum extrato disponível ainda." />
    </div>
  );
}
