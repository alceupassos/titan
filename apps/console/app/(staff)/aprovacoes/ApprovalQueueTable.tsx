"use client";

// Tabela interativa da fila de aprovações (Fase 2, Passo 4). Client component porque cada linha
// tem estado próprio (campo de comentário de rejeição, transição pendente, resultado da decisão).
// Os dados recebidos via props são AMOSTRA ESTÁTICA (../sample-data.ts) — a ação chamada
// (`decideApprovalAction`, ./actions.ts) é a Server Action real, contra o banco.
import { useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import { format, money } from "@titan/money";
import type { ApprovalRequest, ApprovalRisk, ApprovalStatus, ApprovalType } from "@titan/domain";
import { decideApprovalAction } from "./actions";

const RISK_LABEL: Record<ApprovalRisk, string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
};

// The Status-Needs-Text Rule (DESIGN.md §2): cor semântica sempre acompanhada de texto — nunca só
// a cor. `low` usa o tom `info` (neutro-informativo), nunca o verde-acento (reservado a status
// positivo de verdade, DESIGN.md "The One Voice Rule").
const RISK_TONE: Record<ApprovalRisk, StatusTone> = {
  low: "info",
  medium: "warning",
  high: "negative",
};

const TYPE_LABEL: Record<ApprovalType, string> = {
  payout_batch: "Repasse",
  refund: "Reembolso",
  purchase_order: "Ordem de compra",
  work_order_budget: "Orçamento de OS",
  bank_account_change: "Alteração de conta bancária",
  price_out_of_band: "Preço fora da faixa",
  fiscal_cancellation: "Cancelamento fiscal",
  inventory_adjustment: "Ajuste de estoque",
  security_deposit_charge: "Cobrança de caução",
  role_change: "Mudança de papel",
  pii_bulk_export: "Exportação em massa de PII",
  agent_action: "Ação de agente",
};

const STATUS_LABEL: Record<ApprovalStatus, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  rejected: "Rejeitada",
  expired: "Expirada",
  executed: "Executada",
  failed: "Falhou",
};

const SLA_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** `requestedBy` segue o formato do Agent Action Badge (DESIGN.md §5) quando é ação de agente
 * (`agent:<nome> v<versão>`) — mesmo peso visual de uma pessoa, nunca confundido com status
 * positivo (por isso texto simples em `fg-muted`/mono, nunca o verde-acento). */
function formatRequestedBy(requestedBy: string): { label: string; isAgent: boolean } {
  return { label: requestedBy, isAgent: requestedBy.startsWith("agent:") };
}

interface RowState {
  rejecting: boolean;
  comment: string;
  error: string | undefined;
  decidedStatus: ApprovalStatus | undefined;
}

export interface ApprovalQueueTableProps {
  requests: readonly ApprovalRequest[];
}

export function ApprovalQueueTable({ requests }: ApprovalQueueTableProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRowState((prev) => {
      const current: RowState = prev[id] ?? { rejecting: false, comment: "", error: undefined, decidedStatus: undefined };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function submitDecision(requestId: string, decisionInput: { decision: "approve" | "reject"; comment?: string }): void {
    startTransition(async () => {
      const result = await decideApprovalAction({ approvalRequestId: requestId, ...decisionInput });
      if (result.ok) {
        patchRow(requestId, { error: undefined, decidedStatus: result.data.status, rejecting: false });
      } else {
        patchRow(requestId, { error: result.error });
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-label text-fg-muted">
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Solicitado por</th>
            <th className="px-4 py-3 font-medium">Motivo</th>
            <th className="px-4 py-3 font-medium">Impacto</th>
            <th className="px-4 py-3 font-medium">Risco</th>
            <th className="px-4 py-3 font-medium">Prazo (SLA)</th>
            <th className="px-4 py-3 font-medium">Decisão</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => {
            const state = rowState[request.id];
            const decidedStatus = state?.decidedStatus;
            const requestedBy = formatRequestedBy(request.requestedBy);

            return (
              <tr key={request.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3 align-top">{TYPE_LABEL[request.type]}</td>
                <td className="px-4 py-3 align-top">
                  <span className={requestedBy.isAgent ? "font-mono text-xs text-fg-muted" : "text-fg"}>
                    {requestedBy.label}
                  </span>
                </td>
                <td className="px-4 py-3 align-top max-w-sm text-fg-muted">{request.rationale}</td>
                <td className="px-4 py-3 align-top tabular-figures">
                  {request.impact.amountCents != null ? format(money(request.impact.amountCents, "BRL")) : "—"}
                </td>
                <td className="px-4 py-3 align-top">
                  <StatusPill tone={RISK_TONE[request.risk]}>{RISK_LABEL[request.risk]}</StatusPill>
                </td>
                <td className="px-4 py-3 align-top tabular-figures">{SLA_FORMATTER.format(request.slaAtEpochMs)}</td>
                <td className="px-4 py-3 align-top">
                  {decidedStatus ? (
                    <StatusPill tone={decidedStatus === "approved" ? "positive" : "negative"}>
                      {STATUS_LABEL[decidedStatus]}
                    </StatusPill>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => submitDecision(request.id, { decision: "approve" })}
                          className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                        >
                          Aprovar
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => patchRow(request.id, { rejecting: !state?.rejecting })}
                          className="rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                        >
                          Rejeitar
                        </button>
                      </div>
                      {state?.rejecting ? (
                        <div className="flex flex-col gap-1.5">
                          <textarea
                            value={state.comment}
                            onChange={(e) => patchRow(request.id, { comment: e.target.value })}
                            placeholder="Comentário obrigatório para rejeitar (seção 9.4.2) — explique o motivo."
                            rows={2}
                            className="w-64 rounded-control border border-border bg-bg p-2 text-xs text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
                          />
                          <button
                            type="button"
                            disabled={isPending || state.comment.trim().length === 0}
                            onClick={() => submitDecision(request.id, { decision: "reject", comment: state.comment })}
                            className="self-start rounded-control bg-negative px-3 py-1.5 text-xs font-medium text-fg transition-colors duration-100 hover:bg-negative/90 disabled:opacity-50"
                          >
                            Confirmar rejeição
                          </button>
                        </div>
                      ) : null}
                      {state?.error ? <p className="max-w-64 text-xs text-negative">{state.error}</p> : null}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
