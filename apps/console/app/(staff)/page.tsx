// Rota "/" do cockpit — dia: chegadas, saídas, pendências, alertas (seção 7.2 do prompt único).
// Substitui o antigo `app/page.tsx` de fumaça da Fase 0 (movido para dentro do grupo (staff) real).
import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function DiaPage() {
  return (
    <div className="p-6">
      <PageHeader title="Dia" description="Chegadas, saídas, pendências e alertas de hoje." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Chegadas hoje" value="0" state="empty" />
        <KpiCard label="Saídas hoje" value="0" state="empty" />
        <KpiCard label="Pendências" value="0" state="empty" />
        <KpiCard label="Alertas" value="0" state="empty" />
      </div>
    </div>
  );
}
