// Contratos fiscais (Fase 4, Passo 3 — docs/fase-atual.md). Payload de emissão manual/reprocesso
// no cockpit ((staff)/fiscal) — mesmo espírito de packages/contracts/src/approval.ts/distribution.ts:
// fonte única de validação Zod para a Server Action, espelhando o vocabulário de
// packages/domain/src/fiscal/ sem depender desse pacote (consumido por client components).
import { z } from "zod";

const uuidSchema = z.string().uuid();

// Reprocesso de uma emissão rejeitada/pendente — identifica o fiscal_document a tentar de novo.
// Nunca recalcula o natural_key (a idempotência forte já está gravada); só reenvia a MESMA
// intenção ao gateway.
export const RetryInvoiceIssuanceSchema = z.object({
  fiscalDocumentId: uuidSchema,
});
export type RetryInvoiceIssuance = z.infer<typeof RetryInvoiceIssuanceSchema>;

// Cancelamento de nota já emitida (I7 — nunca edição, só cancelamento/substituição).
export const CancelInvoiceSchema = z.object({
  fiscalDocumentId: uuidSchema,
  reason: z.string().min(1, "Motivo do cancelamento é obrigatório — nunca um cancelamento silencioso."),
});
export type CancelInvoice = z.infer<typeof CancelInvoiceSchema>;
