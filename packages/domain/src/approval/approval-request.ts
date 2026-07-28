// Fila central de aprovações (seção 9.4.2 do prompt único): toda ação com consequência financeira
// ou fiscal passa por uma `ApprovalRequest` antes de executar — nunca é decidida sozinha por um
// agente de IA nem confirmada por um botão de chat sem controle interno (anti-padrão #14/#15).
//
// Nesta fase (Passo 1 da Fase 2), só o tipo `refund` tem regra de negócio implementada de fato —
// é o que o checkout/ledger básico da Fase 2 precisa. Os outros 10 tipos da seção 9.4.2 entram no
// union `ApprovalType` só para o shape do agregado já nascer correto quando cada bounded context
// (`payouts`, `supply`, `vendors`, `pricing_intel`, `identity` etc.) precisar dele nas fases
// seguintes — nenhuma lógica de negócio para eles é implementada aqui.
import type { Cents } from "../ledger/ledger-entry";

export type ApprovalType =
  | "payout_batch"
  | "refund"
  | "purchase_order"
  | "work_order_budget"
  | "bank_account_change"
  | "price_out_of_band"
  | "fiscal_cancellation"
  | "inventory_adjustment"
  | "security_deposit_charge"
  | "role_change"
  | "pii_bulk_export"
  | "agent_action";

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired" | "executed" | "failed";

export type ApprovalRisk = "low" | "medium" | "high";

export interface ApprovalImpact {
  /** Ausente para tipos sem valor monetário direto (ex.: `role_change`). Continua sem ser `Money`
   * porque impacto de aprovação pode não ter moeda resolvida ainda no momento da abertura (ex.:
   * estimativa) — decisão a revisar quando `packages/approvals` ganhar trabalho real. */
  readonly amountCents?: Cents;
  readonly affectedEntities: readonly string[];
}

/**
 * `requestedBy` identifica quem ABRIU a solicitação — nunca quem a executa sozinho (anti-padrão
 * #14: consequência financeira decidida por IA sem confirmação humana é rejeitado por design).
 * Shape escolhido: string livre que é OU um id de usuário (`user_...`), OU um identificador de
 * agente no formato `agent:<nome> v<versão>` — mesmo formato do Agent Action Badge (DESIGN.md,
 * seção 5) — para que a mesma trilha de auditoria sirva tanto para ação humana quanto de agente.
 */
export interface ApprovalRequest {
  readonly id: string;
  readonly tenantId: string;
  readonly type: ApprovalType;
  readonly requestedBy: string;
  readonly rationale: string;
  readonly impact: ApprovalImpact;
  readonly risk: ApprovalRisk;
  readonly requiredApprovals: 1 | 2;
  readonly stepUpRequired: boolean;
  /** epoch ms — prazo (SLA) para decisão; injetado pelo chamador, nunca calculado com `Date.now()`
   * dentro do domínio. */
  readonly slaAtEpochMs: number;
  readonly status: ApprovalStatus;
}
