import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function DistribuicaoPage() {
  return (
    <div className="p-6">
      <PageHeader title="Distribuição" description="Saúde dos canais, mapeamentos, divergências, DLQ." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Canais conectados" value="0" state="empty" />
        <KpiCard label="Divergências abertas" value="0" state="empty" />
        <KpiCard label="Fila DLQ" value="0" state="empty" />
        <KpiCard label="Última sincronização" value="—" state="empty" />
      </div>
    </div>
  );
}
