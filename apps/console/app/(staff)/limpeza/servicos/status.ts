// Vocabulário de status da OS técnica compartilhado entre ./page.tsx (Server Component) e
// ./WorkOrderList.tsx (client component) — extraído para um módulo próprio em vez de definido
// dentro de page.tsx para não fazer o client component importar de um arquivo `page.tsx` (Next.js
// App Router trata `page.tsx` como rota, não como módulo utilitário comum).
import { canTransitionWorkOrder, type WorkOrderStatus } from "@titan/domain";

// Todo estado possível da FSM (packages/domain/src/work-order/state-machine.ts) — usado para
// calcular, para CADA linha, quais são os próximos estados válidos (nunca a lista inteira solta).
export const ALL_WORK_ORDER_STATUSES: readonly WorkOrderStatus[] = [
  "opened",
  "triage",
  "budget",
  "dispatched",
  "accepted_vendor",
  "executing",
  "accepted_titan",
  "rework",
  "billed",
  "paid",
  "rated",
];

export const WORK_ORDER_STATUS_LABEL: Record<WorkOrderStatus, string> = {
  opened: "Aberta",
  triage: "Triagem",
  budget: "Orçamento",
  dispatched: "Despachada",
  accepted_vendor: "Aceita pelo prestador",
  executing: "Em execução",
  accepted_titan: "Aceita pela Titan",
  rework: "Retrabalho",
  billed: "Faturada",
  paid: "Paga",
  rated: "Avaliada",
};

/** Próximos estados válidos a partir de `from`, segundo a FSM real do domínio
 * (`canTransitionWorkOrder`) — nunca a lista inteira de 11 estados exibida solta. */
export function nextValidStatuses(from: WorkOrderStatus): WorkOrderStatus[] {
  return ALL_WORK_ORDER_STATUSES.filter((candidate) => canTransitionWorkOrder(from, candidate));
}
