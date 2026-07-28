import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function EstoquePage() {
  return (
    <div className="p-6">
      <PageHeader title="Estoque" description="Saldos, movimentos, contagens, reposição preditiva." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Itens abaixo do mínimo" value="0" state="empty" />
        <KpiCard label="Movimentos hoje" value="0" state="empty" />
        <KpiCard label="Contagens pendentes" value="0" state="empty" />
        <KpiCard label="Sugestões de reposição" value="0" state="empty" />
      </div>
    </div>
  );
}
