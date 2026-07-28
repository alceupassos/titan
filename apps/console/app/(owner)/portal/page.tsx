// Visão geral do portal do proprietário — rotas do owner vivem sob /portal/* (decisão desta
// faixa: route groups não criam segmento de URL, então (staff)/ e (owner)/ colidiriam em "/" se
// ambos ficassem soltos na raiz; ver relatório final da tarefa).
import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function PortalVisaoGeralPage() {
  return (
    <div className="p-6">
      <PageHeader title="Visão geral" description="Desempenho e repasse das suas unidades." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Ocupação da unidade" value="0%" state="empty" />
        <KpiCard label="Receita do mês" value="R$ 0,00" state="empty" />
        <KpiCard label="Repasse previsto" value="R$ 0,00" state="empty" />
        <KpiCard label="Próxima chegada" value="—" state="empty" />
      </div>
    </div>
  );
}
