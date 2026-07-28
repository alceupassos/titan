import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function TarifasPage() {
  return (
    <div className="p-6">
      <PageHeader title="Tarifas" description="Planos, temporadas, restrições e edição em massa." />
      <EmptyState message="Nenhum plano de tarifa cadastrado ainda." />
    </div>
  );
}
