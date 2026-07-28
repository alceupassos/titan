"use client";

// Formulário de datas -> cotação server-side -> avançar para checkout (Fase 2, Passo 4c). Mesmo
// padrão de dois passos client-side de apps/console/app/(staff)/reservas/nova/page.tsx, chamando
// a Server Action real de `./actions.ts` (nada de preço calculado aqui no cliente).
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format as formatMoney } from "@titan/money";
import type { RatePlan } from "@titan/domain";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { createQuoteAction, type ActionResult } from "./actions";
import type { QuoteResponse } from "@titan/contracts";

export interface QuoteFormProps {
  readonly unitId: string;
  readonly ratePlans: readonly RatePlan[];
  readonly initialCheckinISO?: string | undefined;
  readonly initialCheckoutISO?: string | undefined;
}

export function QuoteForm({ unitId, ratePlans, initialCheckinISO, initialCheckoutISO }: QuoteFormProps) {
  const router = useRouter();
  const firstPlan = ratePlans[0];
  const [ratePlanId, setRatePlanId] = useState(firstPlan?.id ?? "");
  const [checkinISO, setCheckinISO] = useState(initialCheckinISO ?? "");
  const [checkoutISO, setCheckoutISO] = useState(initialCheckoutISO ?? "");
  const [quoteResult, setQuoteResult] = useState<ActionResult<QuoteResponse> | null>(null);
  const [isQuoting, startQuoting] = useTransition();

  const selectedPlan = useMemo(() => ratePlans.find((rp) => rp.id === ratePlanId), [ratePlans, ratePlanId]);

  function updateAndReset<T>(setter: (v: T) => void, value: T): void {
    setter(value);
    setQuoteResult(null);
  }

  function handleCotar(): void {
    if (!checkinISO || !checkoutISO || !ratePlanId) return;
    startQuoting(async () => {
      const result = await createQuoteAction({ unitId, checkinISO, checkoutISO, ratePlanId });
      setQuoteResult(result);
    });
  }

  function handleIrParaCheckout(): void {
    if (!quoteResult?.ok) return;
    const params = new URLSearchParams({
      unitId,
      ratePlanId,
      checkinISO: quoteResult.data.stay.checkin,
      checkoutISO: quoteResult.data.stay.checkout,
      quoteId: quoteResult.data.id,
    });
    router.push(`/checkout?${params.toString()}`);
  }

  const quoteExpired = quoteResult?.ok ? Date.now() >= quoteResult.data.expiresAtEpochMs : false;

  if (ratePlans.length === 0) {
    return <p className="text-ink-muted">Nenhum plano de tarifa cadastrado para esta unidade ainda.</p>;
  }

  return (
    <div className="space-y-4 rounded-card bg-surface p-6 shadow-[var(--shadow-card-rest)]">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Check-in</span>
          <input
            type="date"
            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm tabular-figures text-ink"
            value={checkinISO}
            onChange={(e) => updateAndReset(setCheckinISO, e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-ink-muted">Check-out</span>
          <input
            type="date"
            className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm tabular-figures text-ink"
            value={checkoutISO}
            onChange={(e) => updateAndReset(setCheckoutISO, e.target.value)}
          />
        </label>

        {ratePlans.length > 1 ? (
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-ink-muted">Plano de tarifa</span>
            <select
              className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm text-ink"
              value={ratePlanId}
              onChange={(e) => updateAndReset(setRatePlanId, e.target.value)}
            >
              {ratePlans.map((rp) => (
                <option key={rp.id} value={rp.id}>
                  {rp.name} — {formatMoney(rp.nightlyPrice)}/noite
                </option>
              ))}
            </select>
          </label>
        ) : (
          selectedPlan && (
            <p className="text-sm text-ink-muted sm:col-span-2">
              {selectedPlan.name} — <span className="tabular-figures">{formatMoney(selectedPlan.nightlyPrice)}</span>
              /noite
            </p>
          )
        )}
      </div>

      <Button onClick={handleCotar} disabled={isQuoting || !checkinISO || !checkoutISO}>
        {isQuoting ? "Calculando…" : "Ver preço"}
      </Button>

      {quoteResult && !quoteResult.ok ? (
        <div className="rounded-control border border-border bg-surface-2 p-4 text-sm">
          <Badge tone="negative">Não foi possível cotar</Badge>
          <p className="mt-2 text-ink-muted">{quoteResult.error}</p>
        </div>
      ) : null}

      {quoteResult?.ok ? (
        <div className="space-y-3 rounded-control border border-border bg-surface-2 p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-ink-muted">Total da estadia</span>
            <span className="tabular-figures text-xl font-semibold text-ink">
              {formatMoney(quoteResult.data.priceAmount)}
            </span>
          </div>
          <p className="text-sm text-ink-muted">
            {quoteResult.data.stay.checkin} → {quoteResult.data.stay.checkout}
          </p>
          {quoteExpired ? (
            <Badge tone="warning">Cotação expirada — recalcule o preço</Badge>
          ) : (
            <Button variant="primary" onClick={handleIrParaCheckout}>
              Reservar
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}
