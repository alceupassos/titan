"use client";

// Fluxo de nova reserva (Fase 1, Passo 5 — docs/fase-atual.md): cotação -> confirmação, chamando
// as Server Actions reais de `./actions.ts` (validação Zod + autorização CASL + `withTenant`
// dentro delas mesmas — nada disso é reimplementado aqui no cliente). Client component porque o
// formulário é interativo (dois passos, estado local de cotação); segue o mesmo padrão de
// `apps/console/app/(staff)/calendario/page.tsx`.
//
// LIMITAÇÃO CONHECIDA E DOCUMENTADA: a lista de unidade/tarifa abaixo é AMOSTRA
// (`./sample-data.ts`) — não há Postgres vivo nesta máquina para popular um select real
// (docs/fase-atual.md "Gap conhecido 2"). Os ids de amostra são UUIDs válidos para que a Server
// Action seja exercitada de verdade (Zod aceita o formato); só não existe linha correspondente
// num banco vivo, então uma tentativa real de cotação/confirmação aqui falha honestamente (erro
// de conexão ou "não encontrado"), o que é o comportamento correto sem infra viva — nunca um
// sucesso fingido.
import { useMemo, useState, useTransition } from "react";
import { Button, StatusPill } from "@titan/ui";
import { format as formatMoney } from "@titan/money";
import { PageHeader } from "@/components/PageHeader";
import { createQuoteAction, createReservationAction, type ActionResult } from "./actions";
import { SAMPLE_CHANNELS, SAMPLE_RATE_PLANS, SAMPLE_UNITS } from "./sample-data";
import type { QuoteResponse } from "@titan/contracts";

type Channel = (typeof SAMPLE_CHANNELS)[number];

interface FormState {
  unitId: string;
  ratePlanId: string;
  checkinISO: string;
  checkoutISO: string;
  channel: Channel;
}

const CHANNEL_LABEL: Record<Channel, string> = {
  direct: "Direto",
  airbnb: "Airbnb",
  booking: "Booking",
  vrbo: "VRBO",
  expedia: "Expedia",
};

function initialFormState(): FormState {
  const firstUnit = SAMPLE_UNITS[0]!;
  const firstRatePlan = SAMPLE_RATE_PLANS.find((rp) => rp.unitId === firstUnit.id)!;
  return {
    unitId: firstUnit.id,
    ratePlanId: firstRatePlan.id,
    checkinISO: "2026-08-10",
    checkoutISO: "2026-08-13",
    channel: "direct",
  };
}

export default function NovaReservaPage() {
  const [form, setForm] = useState<FormState>(initialFormState);
  const [quoteResult, setQuoteResult] = useState<ActionResult<QuoteResponse> | null>(null);
  const [reservationResult, setReservationResult] = useState<ActionResult<{ reservationId: string }> | null>(null);
  const [isQuoting, startQuoting] = useTransition();
  const [isConfirming, startConfirming] = useTransition();

  const ratePlansForUnit = useMemo(
    () => SAMPLE_RATE_PLANS.filter((rp) => rp.unitId === form.unitId),
    [form.unitId],
  );

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Trocar qualquer campo invalida a cotação/confirmação já mostradas — evita confirmar uma
    // reserva com dados diferentes dos que foram cotados.
    setQuoteResult(null);
    setReservationResult(null);
  }

  function handleUnitChange(unitId: string): void {
    const firstRatePlan = SAMPLE_RATE_PLANS.find((rp) => rp.unitId === unitId);
    setForm((prev) => ({ ...prev, unitId, ratePlanId: firstRatePlan?.id ?? "" }));
    setQuoteResult(null);
    setReservationResult(null);
  }

  function handleCotar(): void {
    setReservationResult(null);
    startQuoting(async () => {
      const result = await createQuoteAction({
        unitId: form.unitId,
        checkinISO: form.checkinISO,
        checkoutISO: form.checkoutISO,
        ratePlanId: form.ratePlanId,
      });
      setQuoteResult(result);
    });
  }

  function handleConfirmar(): void {
    if (!quoteResult?.ok) return;
    const quote = quoteResult.data;
    startConfirming(async () => {
      const result = await createReservationAction({
        quoteId: quote.id,
        unitId: form.unitId,
        checkinISO: form.checkinISO,
        checkoutISO: form.checkoutISO,
        ratePlanId: form.ratePlanId,
        channel: form.channel,
      });
      setReservationResult(result);
    });
  }

  const quoteExpired = quoteResult?.ok ? Date.now() >= quoteResult.data.expiresAtEpochMs : false;

  return (
    <div className="p-6">
      <PageHeader
        title="Nova reserva"
        description="Cotação -> confirmação, via Server Action real (sem Postgres vivo nesta máquina — ver docs/fase-atual.md)."
      />

      <div className="max-w-xl space-y-4 rounded-card border border-border bg-surface p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-label text-fg-muted">Unidade</span>
            <select
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg"
              value={form.unitId}
              onChange={(e) => handleUnitChange(e.target.value)}
            >
              {SAMPLE_UNITS.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-label text-fg-muted">Plano de tarifa</span>
            <select
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg"
              value={form.ratePlanId}
              onChange={(e) => updateField("ratePlanId", e.target.value)}
            >
              {ratePlansForUnit.map((ratePlan) => (
                <option key={ratePlan.id} value={ratePlan.id}>
                  {ratePlan.name} — {ratePlan.nightlyPriceLabel}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-label text-fg-muted">Check-in</span>
            <input
              type="date"
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm tabular-figures text-fg"
              value={form.checkinISO}
              onChange={(e) => updateField("checkinISO", e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-label text-fg-muted">Check-out</span>
            <input
              type="date"
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm tabular-figures text-fg"
              value={form.checkoutISO}
              onChange={(e) => updateField("checkoutISO", e.target.value)}
            />
          </label>

          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block text-label text-fg-muted">Canal</span>
            <select
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg"
              value={form.channel}
              onChange={(e) => updateField("channel", e.target.value as Channel)}
            >
              {SAMPLE_CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {CHANNEL_LABEL[channel]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Button onClick={handleCotar} disabled={isQuoting}>
          {isQuoting ? "Cotando…" : "Cotar"}
        </Button>

        {quoteResult && !quoteResult.ok ? (
          <div className="rounded-control border border-border bg-surface-2 p-3 text-sm">
            <StatusPill tone="negative">Erro na cotação</StatusPill>
            <p className="mt-2 text-fg-muted">{quoteResult.error}</p>
          </div>
        ) : null}

        {quoteResult?.ok ? (
          <div className="space-y-3 rounded-control border border-border bg-surface-2 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-label text-fg-muted">Cotação</span>
              <span className="tabular-figures text-lg font-semibold text-fg">
                {formatMoney(quoteResult.data.priceAmount)}
              </span>
            </div>
            <p className="text-sm text-fg-muted">
              {quoteResult.data.stay.checkin} → {quoteResult.data.stay.checkout}
            </p>
            {quoteExpired ? (
              <StatusPill tone="warning">Cotação expirada — cote novamente</StatusPill>
            ) : (
              <Button variant="primary" onClick={handleConfirmar} disabled={isConfirming}>
                {isConfirming ? "Confirmando…" : "Confirmar reserva"}
              </Button>
            )}
          </div>
        ) : null}

        {reservationResult && !reservationResult.ok ? (
          <div className="rounded-control border border-border bg-surface-2 p-3 text-sm">
            <StatusPill tone="negative">Não foi possível confirmar</StatusPill>
            <p className="mt-2 text-fg-muted">{reservationResult.error}</p>
          </div>
        ) : null}

        {reservationResult?.ok ? (
          <div className="rounded-control border border-border bg-surface-2 p-3 text-sm">
            <StatusPill tone="positive">Reserva confirmada</StatusPill>
            <p className="mt-2 text-fg-muted">
              id: <span className="tabular-figures text-fg">{reservationResult.data.reservationId}</span>
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
