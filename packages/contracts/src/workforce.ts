// Contratos de pessoas e campo (Fase 9, Passo 3 — docs/fase-atual.md). Cadastro de membro,
// atribuição/resposta de escala, emissão/transferência de credencial de acesso, desligamento
// (motivo obrigatório — mesmo padrão de reprovação/cancelamento em fases anteriores) e registro
// de conclusão de tarefa (consumida tanto pelo cockpit quanto pelo app de campo). Mesmo espírito
// de packages/contracts/src/supply.ts: fonte única de validação Zod, espelhando o vocabulário de
// packages/domain/src/workforce/ sem depender desse pacote.
import { z } from "zod";
import { ChecklistItemResponseSchema } from "./housekeeping";

const uuidSchema = z.string().uuid();
const civilDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data deve estar no formato YYYY-MM-DD (data civil, sem hora/fuso).");

export const OnboardMemberSchema = z.object({
  fullName: z.string().min(1, "Nome é obrigatório."),
  role: z.string().min(1, "Cargo é obrigatório."),
  zones: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  employmentType: z.enum(["employee", "contractor", "unspecified"]).default("unspecified"),
});
export type OnboardMember = z.infer<typeof OnboardMemberSchema>;

export const AssignShiftSchema = z.object({
  memberId: uuidSchema,
  date: civilDateSchema,
});
export type AssignShift = z.infer<typeof AssignShiftSchema>;

export const RespondToShiftAssignmentSchema = z.object({
  shiftAssignmentId: uuidSchema,
  response: z.enum(["accepted", "declined"]),
});
export type RespondToShiftAssignment = z.infer<typeof RespondToShiftAssignmentSchema>;

export const IssueAccessCredentialSchema = z.object({
  memberId: uuidSchema,
  credentialType: z.enum(["physical_key", "digital_code", "app_access"]),
  credentialId: z.string().min(1, "Identificador da credencial é obrigatório."),
});
export type IssueAccessCredential = z.infer<typeof IssueAccessCredentialSchema>;

export const TransferAccessCredentialSchema = z.object({
  credentialId: z.string().min(1),
  fromMemberId: uuidSchema,
  toMemberId: uuidSchema,
});
export type TransferAccessCredential = z.infer<typeof TransferAccessCredentialSchema>;

// Desligamento — motivo obrigatório (nunca desligamento silencioso, mesma disciplina de I10/
// reprovação de checklist). A Server Action é quem dispara a revogação de TODAS as credenciais
// ativas do membro, nunca este contrato sozinho.
export const DismissMemberSchema = z.object({
  memberId: uuidSchema,
  reason: z.string().min(1, "Motivo do desligamento é obrigatório."),
});
export type DismissMember = z.infer<typeof DismissMemberSchema>;

export const RecordTaskCompletionSchema = z.object({
  memberId: uuidSchema,
  taskId: z.string().min(1),
  evidenceHashes: z.array(z.string()).default([]),
  responses: z.array(ChecklistItemResponseSchema).default([]),
});
export type RecordTaskCompletion = z.infer<typeof RecordTaskCompletionSchema>;
