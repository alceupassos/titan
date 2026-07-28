"use client";

// Formulário de hóspede + método de pagamento (Fase 2, Passo 4c). Nenhum campo de número de
// cartão é renderizado por este componente em NENHUMA circunstância (I4 — docs/invariantes.md):
// a opção "Cartão" mostra um placeholder explícito de onde os hosted fields do gateway entram
// quando o adapter estiver plugado (packages/payments, faixa paralela — ver TODO em ./actions.ts).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentMethod } from "@titan/contracts";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { createCheckoutAction, type CheckoutActionResult } from "./actions";

export interface CheckoutFormProps {
  readonly unitId: string;
  readonly ratePlanId: string;
  readonly checkinISO: string;
  readonly checkoutISO: string;
}

export function CheckoutForm({ unitId, ratePlanId, checkinISO, checkoutISO }: CheckoutFormProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix");
  const [result, setResult] = useState<CheckoutActionResult | null>(null);
  const [isSubmitting, startSubmitting] = useTransition();

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    startSubmitting(async () => {
      const outcome = await createCheckoutAction({
        unitId,
        ratePlanId,
        checkinISO,
        checkoutISO,
        guest: { name, email, phone },
        paymentMethod,
      });
      setResult(outcome);
      if (outcome.ok) {
        router.push(`/reservas/${outcome.data.reservationId}/confirmacao`);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-card bg-surface p-6 shadow-[var(--shadow-card-rest)]">
      <fieldset className="space-y-4">
        <legend className="font-display text-lg text-ink">Seus dados</legend>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Nome completo</span>
          <input
            required
            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-ink"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">E-mail</span>
          <input
            required
            type="email"
            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-ink"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Telefone</span>
          <input
            required
            type="tel"
            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-ink"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="font-display text-lg text-ink">Pagamento</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PaymentOption
            label="PIX"
            description="Confirmação em minutos."
            selected={paymentMethod === "pix"}
            onSelect={() => setPaymentMethod("pix")}
          />
          <PaymentOption
            label="Cartão"
            description="Crédito, via provedor tokenizado."
            selected={paymentMethod === "card"}
            onSelect={() => setPaymentMethod("card")}
          />
        </div>

        {paymentMethod === "card" ? (
          <div className="rounded-control border border-dashed border-border bg-surface-2 p-4 text-sm text-ink-muted">
            Campos de cartão do gateway (hosted fields/tokenização) entram aqui quando o adapter
            estiver plugado — esta aplicação nunca coleta número de cartão diretamente (I4).
          </div>
        ) : (
          <div className="rounded-control border border-border bg-surface-2 p-4 text-sm text-ink-muted">
            O código PIX é gerado no próximo passo, assim que o adapter de pagamento estiver
            plugado.
          </div>
        )}
      </fieldset>

      {result && !result.ok ? (
        <div className="rounded-control border border-border bg-surface-2 p-4 text-sm">
          <Badge tone="negative">Não foi possível confirmar</Badge>
          <p className="mt-2 text-ink-muted">{result.error}</p>
        </div>
      ) : null}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Enviando…" : "Confirmar reserva"}
      </Button>
    </form>
  );
}

function PaymentOption({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-control border p-4 text-left transition-colors ${
        selected ? "border-accent bg-accent/10" : "border-border bg-surface"
      }`}
    >
      <span className="block font-medium text-ink">{label}</span>
      <span className="mt-1 block text-xs text-ink-muted">{description}</span>
    </button>
  );
}
