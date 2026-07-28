// Máquina de estados da fila de aprovações (seção 9.4.2 do prompt único). Reusa o helper genérico
// de packages/domain/src/fsm.ts, mesmo padrão de reservation/payment/unit/fiscal-document/work-order.
import { canTransition, transition, type Transitions } from "../fsm";
import type { ApprovalRequest, ApprovalStatus } from "./approval-request";

const APPROVAL_TRANSITIONS: Transitions<ApprovalStatus> = {
  pending: ["approved", "rejected", "expired"],
  approved: ["executed", "failed"],
  rejected: [],
  expired: [],
  executed: [],
  failed: [],
};

export function canTransitionApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return canTransition(APPROVAL_TRANSITIONS, from, to);
}

export function transitionApproval(from: ApprovalStatus, to: ApprovalStatus): ApprovalStatus {
  return transition(APPROVAL_TRANSITIONS, from, to);
}

/** Seção 9.4.2 do prompt único: "rejeição exige comentário" — nunca uma rejeição silenciosa. */
export class RejectionRequiresCommentError extends Error {
  constructor() {
    super(
      "Rejeição de solicitação de aprovação exige comentário (seção 9.4.2 do prompt único) — " +
        "rejeição silenciosa não é permitida.",
    );
    this.name = "RejectionRequiresCommentError";
  }
}

/**
 * Rejeita a solicitação — imutável: retorna uma NOVA `ApprovalRequest` com `status: "rejected"`,
 * nunca muta `request` (mesmo espírito de I3: correção/mudança de estado é sempre um novo valor,
 * nunca uma edição in-place). Lança `RejectionRequiresCommentError` se `comment` for vazio ou só
 * espaço em branco. Onde o comentário em si é persistido (evento de auditoria separado, histórico
 * de aprovação) é decisão de `packages/approvals`/`packages/db`, fora de escopo de domínio puro.
 */
export function rejectApproval(request: ApprovalRequest, comment: string): ApprovalRequest {
  if (!comment || comment.trim().length === 0) {
    throw new RejectionRequiresCommentError();
  }
  const status = transitionApproval(request.status, "rejected");
  return { ...request, status };
}
