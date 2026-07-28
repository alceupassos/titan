// Contratos de agentes (Fase 10, Passo 3 — docs/fase-atual.md). Disparo de conversa do Concierge
// e configuração de kill switch por agente. A DECISÃO sobre uma `approval_request` tipo
// `"agent_action"` (Concierge pedindo confirmação humana) reusa `ApprovalDecisionSchema`
// (packages/contracts/src/approval.ts) já existente desde a Fase 2 — nunca um schema paralelo.
import { z } from "zod";

export const RunConciergeConversationSchema = z.object({
  unitId: z.string().uuid().optional(),
  userMessage: z.string().min(1, "Mensagem do usuário é obrigatória."),
  /** Conteúdo vindo de hóspede/canal externo é sempre `false` — guardrail #1
   * (packages/agents/src/guardrails.ts) depende deste campo para decidir se uma ferramenta de
   * escrita pode ser oferecida nesta conversa. */
  trusted: z.boolean(),
});
export type RunConciergeConversation = z.infer<typeof RunConciergeConversationSchema>;

export const ToggleAgentKillSwitchSchema = z.object({
  agentName: z.string().min(1),
  enabled: z.boolean(),
});
export type ToggleAgentKillSwitch = z.infer<typeof ToggleAgentKillSwitchSchema>;
