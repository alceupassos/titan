// Fumaça da Fase 0: prova que @titan/ui renderiza de verdade a partir dos tokens de DESIGN.md.
// As rotas reais do cockpit (seção 7.2 do prompt único) nascem na Fase 1 em diante.
import { KpiCard } from "@titan/ui";

export default function DashboardPlaceholder() {
  return (
    <main className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard label="Total de Reservas" value="0" delta="—" trend="flat" state="empty" />
      <KpiCard label="Ocupação" value="0%" delta="—" trend="flat" state="empty" />
      <KpiCard label="Receita (mês)" value="R$ 0,00" delta="—" trend="flat" state="empty" />
      <KpiCard label="Aprovações pendentes" value="0" delta="—" trend="flat" state="empty" />
    </main>
  );
}
