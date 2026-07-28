// Contratos de pagamento/reembolso (Fase 2, Passo 3). `RefundRequestSchema` é a entrada da
// Server Action que ABRE uma solicitação de reembolso em `(staff)/aprovacoes` (seção 9.4.2 do
// prompt único) — nunca executa o reembolso sozinha; execução real só depois de aprovação humana
// (anti-padrão #14/#15), ver `packages/domain/src/approval`.
import { z } from "zod";

export const GatewaySchema = z.enum(["asaas", "stripe"]);
export type Gateway = z.infer<typeof GatewaySchema>;

export const RefundRequestSchema = z.object({
  reservationId: z.string().uuid(),
  paymentIntentId: z.string().uuid(),
  refundAmountCents: z.number().int().positive(),
  reason: z.string().min(1, "Motivo do reembolso é obrigatório — vira o `rationale` da solicitação de aprovação."),
});
export type RefundRequest = z.infer<typeof RefundRequestSchema>;
