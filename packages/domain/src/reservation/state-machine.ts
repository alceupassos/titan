// I1 — Uma unidade nunca tem duas reservas confirmadas com períodos sobrepostos, independente
// do canal. A garantia real é a constraint EXCLUDE USING gist no banco (packages/db); esta
// função é a MESMA semântica expressa como função pura, para poder ser testada e reutilizada
// antes de qualquer I/O (ex.: pré-validação no checkout, antes de tentar o INSERT).
import { overlaps, type Stay } from "@titan/dates";
import { canTransition, transition, type Transitions } from "../fsm";

export type ReservationStatus = "pending" | "confirmed" | "cancelled" | "no_show";

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
