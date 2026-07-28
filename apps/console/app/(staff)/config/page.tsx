import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function ConfigPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Configurações"
        description="Usuários, papéis, políticas, tributos, integrações, auditoria."
      />
      <EmptyState message="Nenhuma configuração carregada ainda." />
    </div>
  );
}
