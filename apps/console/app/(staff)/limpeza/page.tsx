// Quadro do dia (I9 — máquina de estados da unidade). Estados exibidos aqui espelham
// docs/domain/modelo-dominio.md §2: dirty → cleaning → clean → inspected → ready.
import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function LimpezaPage() {
  return (
    <div className="p-6">
      <PageHeader title="Limpeza" description="Quadro do dia — unidades por estado de virada (I9)." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sujas" value="0" state="empty" />
        <KpiCard label="Em limpeza" value="0" state="empty" />
        <KpiCard label="Aguardando inspeção" value="0" state="empty" />
        <KpiCard label="Prontas" value="0" state="empty" />
      </div>
    </div>
  );
}
