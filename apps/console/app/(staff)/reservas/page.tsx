import Link from "next/link";
import { Button, KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";

export default function ReservasPage() {
  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader title="Reservas" description="Reservas confirmadas e propostas, todos os canais." />
        {/* Passo 5 da Fase 1 (docs/fase-atual.md): fluxo real de cotação -> confirmação, via
            Server Action com Zod + CASL + `withTenant` (apps/console/app/(staff)/reservas/nova). */}
        <Link href="/reservas/nova">
          <Button variant="primary">Nova reserva</Button>
        </Link>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Reservas ativas" value="0" state="empty" />
        <KpiCard label="Chegando em 7 dias" value="0" state="empty" />
        <KpiCard label="Canceladas (mês)" value="0" state="empty" />
        <KpiCard label="Overbooking em risco" value="0" state="empty" />
      </div>
      <EmptyState message="Nenhuma reserva ainda — a lista real chega em F1 junto com o motor de disponibilidade." />
    </div>
  );
}
