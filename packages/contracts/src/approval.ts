// Contrato de decisão da fila de aprovações (Fase 2, Passo 3) — seção 9.4.2 do prompt único:
// "rejeição exige comentário", nunca uma rejeição silenciosa. Espelha a regra de domínio de
// `packages/domain/src/approval/approval-state-machine.ts` (`rejectApproval`,
// `RejectionRequiresCommentError`) na borda HTTP/Server Action, para o erro aparecer no
// formulário antes de qualquer chamada ao servidor, não só depois.
import { z } from "zod";

export const ApprovalDecisionSchema = z
  .object({
    approvalRequestId: z.string().uuid(),
    decision: z.enum(["approve", "reject"]),
    comment: z.string().optional(),
  })
  .refine((value) => value.decision !== "reject" || (value.comment && value.comment.trim().length > 0), {
    message: "Rejeição exige comentário (seção 9.4.2 do prompt único) — rejeição silenciosa não é permitida.",
    path: ["comment"],
  });
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
