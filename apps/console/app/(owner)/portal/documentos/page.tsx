import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function PortalDocumentosPage() {
  return (
    <div className="p-6">
      <PageHeader title="Documentos" description="Contratos, laudos e documentos compartilhados." />
      <EmptyState message="Nenhum documento disponível ainda." />
    </div>
  );
}
