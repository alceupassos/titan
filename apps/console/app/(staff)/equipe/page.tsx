import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function EquipePage() {
  return (
    <div className="p-6">
      <PageHeader title="Equipe" description="Escala, produtividade, acessos." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Em escala hoje" value="0" state="empty" />
        <KpiCard label="Produtividade média" value="—" state="empty" />
        <KpiCard label="Acessos ativos" value="0" state="empty" />
        <KpiCard label="Pendências de RH" value="0" state="empty" />
      </div>
    </div>
  );
}
