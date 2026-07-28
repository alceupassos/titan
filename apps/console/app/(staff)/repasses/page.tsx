import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function RepassesPage() {
  return (
    <div className="p-6">
      <PageHeader title="Repasses" description="Fechamento por proprietário, PIX em lote, extratos." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Repasses pendentes" value="0" state="empty" />
        <KpiCard label="Total do lote" value="R$ 0,00" state="empty" />
        <KpiCard label="Proprietários aguardando" value="0" state="empty" />
        <KpiCard label="Último fechamento" value="—" state="empty" />
      </div>
    </div>
  );
}
