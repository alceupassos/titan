// Timeline de reserva: eventos, pagamentos, notas, mensagens, agentes (seção 7.2). Só o segmento
// dinâmico é provado nesta fase — sem query real.
import { DetailPlaceholder } from "@/components/DetailPlaceholder";
import { PageHeader } from "@/components/PageHeader";

export default async function ReservaDetalhePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="p-6">
      <PageHeader title="Reserva" description="Timeline: eventos, pagamentos, notas, mensagens, agentes." />
      <DetailPlaceholder kind="reserva" id={id} />
    </div>
  );
}
