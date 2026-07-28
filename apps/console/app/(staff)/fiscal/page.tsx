import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";

export default function FiscalPage() {
  return (
    <div className="p-6">
      <PageHeader title="Fiscal" description="Fila de emissão, rejeições, cofre, apuração." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Fila de emissão" value="0" state="empty" />
        <KpiCard label="Rejeições" value="0" state="empty" />
        <KpiCard label="Notas emitidas (mês)" value="0" state="empty" />
        <KpiCard label="Apuração pendente" value="R$ 0,00" state="empty" />
      </div>
    </div>
  );
}
