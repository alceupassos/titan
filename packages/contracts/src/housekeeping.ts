// Contratos de limpeza e evidência (Fase 6, Passo 3 — docs/fase-atual.md). Payload de captura de
// evidência (envelope + hash + assinatura — mesmo shape do "envelope" da seção 9.8.2 do prompt
// único), decisão de revisão (aprovar/aprovar com observação/reprovar com motivo) e submissão de
// checklist — mesmo espírito de packages/contracts/src/approval.ts: fonte única de validação
// Zod, espelhando o vocabulário de packages/domain/src/evidence/ e
// packages/domain/src/housekeeping/ sem depender desses pacotes (consumido por client
// components — a captura em si roda no navegador, T1).
import { z } from "zod";

const uuidSchema = z.string().uuid();

// Envelope selado no dispositivo no instante da captura (seção 9.8.2) — chega ao servidor junto
// com os bytes da imagem (fora deste schema; upload multipart/formData é responsabilidade da
// borda HTTP, não deste contrato) e a assinatura HMAC sobre o JSON canônico do envelope.
export const EvidenceEnvelopeSchema = z.object({
  contentHash: z.string().min(1),
  capturedAtEpochMs: z.number().int().positive(),
  deviceId: z.string().min(1),
  appVersion: z.string().min(1),
  taskId: uuidSchema,
  checklistItemId: z.string().min(1),
  unitId: uuidSchema,
  room: z.string().min(1),
  geo: z.object({ lat: z.number(), lng: z.number(), accuracy: z.number() }).nullable(),
  referenceShotId: z.string().nullable(),
});
export type EvidenceEnvelope = z.infer<typeof EvidenceEnvelopeSchema>;

export const SubmitCaptureSchema = z.object({
  envelope: EvidenceEnvelopeSchema,
  signature: z.string().min(1),
});
export type SubmitCapture = z.infer<typeof SubmitCaptureSchema>;

// Decisão do painel de revisão (seção 9.8.1) — "reprovar com motivo → rework sem novo pagamento".
export const ReviewDecisionSchema = z
  .object({
    cleaningTaskId: uuidSchema,
    decision: z.enum(["approve", "approve_with_note", "reject"]),
    note: z.string().optional(),
  })
  .refine((value) => value.decision !== "reject" || (value.note && value.note.trim().length > 0), {
    message: "Reprovação exige motivo específico (anti-padrão #13: nunca reprovar sem apontar item).",
    path: ["note"],
  });
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

// Resposta a um item do checklist durante a execução — espelha ChecklistItemResponse de
// packages/domain/src/housekeeping/checklist.ts.
export const ChecklistItemResponseSchema = z.object({
  itemId: z.string().min(1),
  answered: z.boolean(),
  passed: z.boolean().optional(),
});

export const SubmitChecklistSchema = z.object({
  cleaningTaskId: uuidSchema,
  responses: z.array(ChecklistItemResponseSchema).min(1),
});
export type SubmitChecklist = z.infer<typeof SubmitChecklistSchema>;
