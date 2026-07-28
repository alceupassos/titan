import { notFound } from "next/navigation";
import { format as formatMoney } from "@titan/money";
import { getReservationById } from "@/lib/queries";
import { Badge } from "@/components/ui/Badge";

export default async function ConfirmacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reservation = await getReservationById(id);

  if (!reservation) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <Badge tone="positive">Reserva recebida</Badge>
      <h1 className="mt-4 font-display text-3xl text-ink">
        {reservation.unitName ?? "Sua unidade"}
      </h1>
      <p className="mt-2 text-ink-muted">{reservation.stayLiteral}</p>
      <p className="mt-6 tabular-figures text-2xl font-semibold text-ink">
        {formatMoney(reservation.priceAmount)}
      </p>

      <div className="mx-auto mt-8 max-w-md rounded-card bg-surface-2 p-5 text-left text-sm text-ink-muted">
        <p>
          <span className="font-medium text-ink">Código da reserva:</span>{" "}
          <span className="tabular-figures">{reservation.id}</span>
        </p>
        <p className="mt-2">
          <span className="font-medium text-ink">Status:</span> {reservation.status}
        </p>
        {/* Passo 6 (integração final): a intenção de pagamento é criada de verdade no checkout
            (ver app/checkout/actions.ts), mas a CONFIRMAÇÃO (pending -> confirmed) só chega via
            webhook processado por apps/worker quando o gateway avisar que capturou o pagamento —
            esta página nunca finge que o dinheiro já entrou só porque a intenção foi criada. */}
        {reservation.paymentIntentStatus === null ? (
          <p className="mt-4 rounded-control border border-dashed border-border bg-surface p-3">
            Pagamento pendente de integração com o gateway — nossa equipe vai confirmar sua reserva
            por e-mail assim que o pagamento for processado.
          </p>
        ) : (
          <p className="mt-4 rounded-control border border-border bg-surface p-3">
            <span className="font-medium text-ink">Pagamento:</span> {reservation.paymentIntentStatus}
            {reservation.status === "pending" ? (
              <span className="mt-1 block text-xs text-ink-muted">
                Sua reserva será confirmada automaticamente assim que o pagamento for capturado
                pelo gateway.
              </span>
            ) : null}
          </p>
        )}
      </div>
    </div>
  );
}
