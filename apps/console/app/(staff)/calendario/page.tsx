"use client";

// Tape chart multi-unidade (ADR-0018) — Passo 4 da Fase 1. Client component porque o `TapeChart`
// desenha em <canvas> e reage a arraste (ponteiro + dnd-kit); os dados abaixo são de AMOSTRA
// (packages/db/seed replicado em memória, ver ./sample-data.ts) porque não há Postgres vivo nesta
// máquina (docs/fase-atual.md "Gap conhecido 2"). Sem persistência real: mover/criar reserva só
// atualiza este `useState` local para dar feedback visual — a Server Action de verdade é o Passo 5.
import { useMemo, useState } from "react";
import { TapeChart, type TapeChartCreateEvent, type TapeChartMoveEvent, type TapeChartReservation } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { buildSampleTapeChartData } from "./sample-data";

export default function CalendarioPage() {
  const { units, reservations: initialReservations } = useMemo(() => buildSampleTapeChartData(), []);
  const [reservations, setReservations] = useState<TapeChartReservation[]>(initialReservations);

  function handleReservationMove(event: TapeChartMoveEvent): void {
    setReservations((prev) =>
      prev.map((r) =>
        r.id === event.reservationId
          ? { ...r, unitId: event.targetUnitId, checkinISO: event.newCheckinISO, checkoutISO: event.newCheckoutISO }
          : r,
      ),
    );
  }

  function handleReservationCreate(event: TapeChartCreateEvent): void {
    setReservations((prev) => [
      ...prev,
      {
        id: `preview-${prev.length}-${event.unitId}-${event.checkinISO}`,
        unitId: event.unitId,
        checkinISO: event.checkinISO,
        checkoutISO: event.checkoutISO,
        status: "pending",
        channel: "direct",
        price: { amountCents: 0, currency: "BRL" },
      },
    ]);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Calendário"
        description="Tape chart multi-unidade — dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />
      <TapeChart
        units={units}
        reservations={reservations}
        initialWindowStartISO="2026-08-01"
        onReservationMove={handleReservationMove}
        onReservationCreate={handleReservationCreate}
      />
    </div>
  );
}
