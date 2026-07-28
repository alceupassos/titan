import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function FinanceiroPage() {
  return (
    <div className="p-6">
      <PageHeader title="Financeiro" description="Ledger, AP/AR, conciliação, settlements, DRE, projeção." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Saldo do ledger" value="R$ 0,00" state="empty" />
        <KpiCard label="Contas a pagar" value="R$ 0,00" state="empty" />
        <KpiCard label="Contas a receber" value="R$ 0,00" state="empty" />
        <KpiCard label="Conciliação pendente" value="0" state="empty" />
      </div>
    </div>
  );
}
