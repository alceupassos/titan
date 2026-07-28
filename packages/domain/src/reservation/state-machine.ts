// I1 — Uma unidade nunca tem duas reservas confirmadas com períodos sobrepostos, independente
// do canal. A garantia real é a constraint EXCLUDE USING gist no banco (packages/db); esta
// função é a MESMA semântica expressa como função pura, para poder ser testada e reutilizada
// antes de qualquer I/O (ex.: pré-validação no checkout, antes de tentar o INSERT).
import type { Money } from "@titan/money";
import { overlaps, type Stay } from "@titan/dates";
import { canTransition, transition, type Transitions } from "../fsm";

export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "no_show";

// Canais de distribuição (seção 6/9.2 do prompt único) — usados para colorir o tape chart e
// para o roteamento de adapters na Fase 3. `direct` é reserva feita direto pelo storefront.
export type Channel = "direct" | "airbnb" | "booking" | "vrbo" | "expedia";

/** Entidade de reserva completa — Fase 1 promove a fatia mínima `ReservationForOverlapCheck`
 * (que continua existindo para o pré-check de I1) para o agregado real usado pelo cockpit. */
export interface Reservation {
  readonly id: string;
  readonly tenantId: string;
  readonly unitId: string;
  readonly stay: Stay;
  readonly status: ReservationStatus;
  readonly channel: Channel;
  readonly priceAmount: Money;
}

const RESERVATION_TRANSITIONS: Transitions<ReservationStatus> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "no_show"],
  cancelled: [],
  no_show: [],
};

export function canTransitionReservation(from: ReservationStatus, to: ReservationStatus): boolean {
  return canTransition(RESERVATION_TRANSITIONS, from, to);
}

export function transitionReservation(from: ReservationStatus, to: ReservationStatus): ReservationStatus {
  return transition(RESERVATION_TRANSITIONS, from, to);
}

export interface ReservationForOverlapCheck {
  readonly unitId: string;
  readonly stay: Stay;
  readonly status: ReservationStatus;
}

/**
 * I1 em função pura: dado o conjunto de reservas ATIVAS (pending|confirmed) já existentes para
 * uma unidade, uma nova reserva pode ser aceita? Rejeita qualquer sobreposição de datas,
 * independentemente do canal de origem — I1 não faz exceção por canal.
 */
export function canAcceptReservation(
  candidate: Pick<ReservationForOverlapCheck, "unitId" | "stay">,
  existing: readonly ReservationForOverlapCheck[],
): boolean {
  const activeInSameUnit = existing.filter(
    (r) => r.unitId === candidate.unitId && (r.status === "pending" || r.status === "confirmed"),
  );
  return !activeInSameUnit.some((r) => overlaps(r.stay, candidate.stay));
}
