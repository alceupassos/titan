import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function PricingPage() {
  return (
    <div className="p-6">
      <PageHeader title="Pricing" description="Sugestões, explicabilidade, backtest e autonomia do modelo." />
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Sugestões pendentes" value="0" state="empty" />
        <KpiCard label="Autonomia atual" value="—" state="empty" />
        <KpiCard label="ΔRevPAR backtest" value="—" state="empty" />
        <KpiCard label="Última execução" value="—" state="empty" />
      </div>
      <EmptyState message="Motor de pricing chega em F8 — depende de F7 (custo variável real, docs/roadmap.md)." />
    </div>
  );
}
