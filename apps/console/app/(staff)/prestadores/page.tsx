import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function PrestadoresPage() {
  return (
    <div className="p-6">
      <PageHeader title="Prestadores" description="Cadastro, certidões, scorecard, ordens de serviço." />
      <EmptyState message="Nenhum prestador cadastrado ainda." />
    </div>
  );
}
