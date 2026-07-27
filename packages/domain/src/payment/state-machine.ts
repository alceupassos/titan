// I2 — Toda reserva confirmada tem lastro financeiro rastreável (autorização, captura,
// liquidação, estorno). Expresso aqui como a máquina de estados que TORNA impossível, no nível
// de domínio, pular direto de "created" para "settled" sem passar por authorized/captured — ou
// seja, não há como representar um pagamento "liquidado" sem o histórico de autorização/captura
// ter existido em algum momento anterior válido.
import { canTransition, transition, type Transitions } from "../fsm";

export type PaymentStatus =
  | "created"
  | "authorized"
  | "captured"
  | "settled"
  | "refunded"
  | "partially_refunded"
  | "disputed"
  | "charged_back";

const PAYMENT_TRANSITIONS: Transitions<PaymentStatus> = {
  created: ["authorized"],
  authorized: ["captured", "disputed"],
  captured: ["settled"],
  settled: ["refunded", "partially_refunded", "disputed"],
  refunded: [],
  partially_refunded: ["refunded"],
  disputed: ["charged_back", "settled"],
  charged_back: [],
};

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return canTransition(PAYMENT_TRANSITIONS, from, to);
}

export function transitionPayment(from: PaymentStatus, to: PaymentStatus): PaymentStatus {
  return transition(PAYMENT_TRANSITIONS, from, to);
}
