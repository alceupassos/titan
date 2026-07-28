import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function ServicosLimpezaPage() {
  return (
    <div className="p-6">
      <PageHeader title="Serviços técnicos" description="Ordens de serviço técnicas e laudos." />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="OS abertas" value="0" state="empty" />
      </div>
      <EmptyState message="Nenhuma ordem de serviço técnica registrada." />
    </div>
  );
}
