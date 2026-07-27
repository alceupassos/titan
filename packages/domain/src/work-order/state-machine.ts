// Ciclo de vida da OS (seção 9.10.2 do prompt único). Não mapeia 1:1 a uma única invariante
// I1-I10, mas é uma das 6 máquinas de estado explicitamente pedidas para a Fase 0.
import { canTransition, transition, type Transitions } from "../fsm";

export type WorkOrderStatus =
  | "opened"
  | "triage"
  | "budget"
  | "dispatched"
  | "accepted_vendor"
  | "executing"
  | "accepted_titan"
  | "rework"
  | "billed"
  | "paid"
  | "rated";

const WORK_ORDER_TRANSITIONS: Transitions<WorkOrderStatus> = {
  opened: ["triage"],
  triage: ["budget", "dispatched"],
  budget: ["dispatched"],
  dispatched: ["accepted_vendor"],
  accepted_vendor: ["executing"],
  executing: ["accepted_titan", "rework"],
  accepted_titan: ["billed"],
  rework: ["executing"], // nova execução vinculada como rework_of — nada é apagado (I10-adjacent)
  billed: ["paid"],
  paid: ["rated"],
  rated: [],
};

export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return canTransition(WORK_ORDER_TRANSITIONS, from, to);
}

export function transitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): WorkOrderStatus {
  return transition(WORK_ORDER_TRANSITIONS, from, to);
}
