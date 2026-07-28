// Contratos financeiros (Fase 5, Passo 3 — docs/fase-atual.md). Payload de submissão de invoice
// de fornecedor (AP), criação de lote de repasse, e decisão de aprovação com step-up — mesmo
// espírito de packages/contracts/src/approval.ts: fonte única de validação Zod, espelhando o
// vocabulário de packages/domain/src/administration/ e packages/domain/src/approval/step-up.ts
// sem depender desses pacotes (consumido por client components).
import { z } from "zod";

const uuidSchema = z.string().uuid();
const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD (data civil, sem hora/fuso).");

// Submissão de conta a pagar — abre um approval_requests tipo 'purchase_order' (fila já
// existente desde a Fase 2), nunca um fluxo de aprovação paralelo.
export const SubmitAccountsPayableSchema = z.object({
  vendorId: uuidSchema,
  unitId: uuidSchema.optional(),
  description: z.string().min(1, "Descrição da despesa é obrigatória."),
  amountCents: z.number().int().positive(),
  currency: z.enum(["BRL", "USD", "EUR"]),
  dueDateISO: civilDateSchema,
});
export type SubmitAccountsPayable = z.infer<typeof SubmitAccountsPayableSchema>;

// Criação de lote de repasse — o cálculo real (comissão, despesas itemizadas, líquido) é
// sempre RECALCULADO no servidor via computePayoutExtract (packages/domain), nunca aceito do
// cliente; este schema só identifica a unidade/período a apurar.
export const CreatePayoutBatchSchema = z.object({
  unitId: uuidSchema,
  periodStartISO: civilDateSchema,
  periodEndISO: civilDateSchema,
});
export type CreatePayoutBatch = z.infer<typeof CreatePayoutBatchSchema>;

// Decisão de aprovação de lote de repasse — `stepUpToken` obrigatório quando o lote exigir
// step-up (docs/decisoes-de-negocio.md pergunta 5: acima de R$ 5.000, Camada 3 da seção 9.4.1).
// A validação de que o token realmente corresponde ao desafio vinculado a ESTE payload
// (verifyStepUpChallenge, packages/domain/src/approval/step-up.ts) acontece na Server Action,
// nunca só aqui na borda Zod.
export const ApprovePayoutBatchSchema = z.object({
  payoutBatchId: uuidSchema,
  stepUpToken: z.string().optional(),
});
export type ApprovePayoutBatch = z.infer<typeof ApprovePayoutBatchSchema>;
