"use client";

// Lista interativa de lotes de repasse (Fase 5, Passo 4b). Client component porque cada linha tem
// estado próprio (envio para aprovação, campo de token de step-up, resultado da decisão). Os dados
// recebidos via props são AMOSTRA ESTÁTICA (../sample-data.ts) — as ações chamadas
// (createPayoutBatchAction/submitPayoutBatchForApprovalAction/approvePayoutBatchAction, ./actions.ts)
// são as Server Actions reais, contra o banco.
//
// Seção 9.4.1 do prompt único: "a tela mostra exatamente o que entra no hash: total, nº de
// beneficiários, cinco maiores valores, destaque em conta alterada nos últimos 30 dias" — nesta
// fase, sem múltiplos beneficiários por lote nem histórico de alteração de conta bancária
// modelados ainda (dívida técnica documentada, não escondida), o painel de confirmação de step-up
// mostra pelo menos total e unidade/proprietário claramente antes do usuário confirmar.
import { useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import { format, money } from "@titan/money";
import type { SamplePayoutBatch, SamplePayoutBatchStatus } from "./sample-data";
import {
  approvePayoutBatchAction,
  createPayoutBatchAction,
  submitPayoutBatchForApprovalAction,
} from "./actions";

const STATUS_LABEL: Record<SamplePayoutBatchStatus, string> = {
  draft: "Rascunho",
  pending_approval: "Aguardando aprovação",
  approved: "Aprovado",
  sent: "Enviado",
  failed: "Falhou",
};

// The Status-Needs-Text Rule (DESIGN.md §2): cor semântica sempre acompanhada de texto.
const STATUS_TONE: Record<SamplePayoutBatchStatus, StatusTone> = {
  draft: "info",
  pending_approval: "warning",
  approved: "positive",
  sent: "positive",
  failed: "negative",
};

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatCivilDate(isoDate: string): string {
  return DATE_FORMATTER.format(new Date(`${isoDate}T00:00:00Z`));
}

interface RowState {
  submitting: boolean;
  stepUpChallenge: string | undefined;
  requiredApprovals: 1 | 2 | undefined;
  stepUpTokenInput: string;
  approving: boolean;
  error: string | undefined;
  currentStatus: SamplePayoutBatchStatus | undefined;
}

const EMPTY_ROW_STATE: RowState = {
  submitting: false,
  stepUpChallenge: undefined,
  requiredApprovals: undefined,
  stepUpTokenInput: "",
  approving: false,
  error: undefined,
  currentStatus: undefined,
};

export interface PayoutBatchListProps {
  batches: readonly SamplePayoutBatch[];
}

export function PayoutBatchList({ batches }: PayoutBatchListProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();
  const [newBatchUnitId, setNewBatchUnitId] = useState("");
  const [newBatchPeriodStart, setNewBatchPeriodStart] = useState("");
  const [newBatchPeriodEnd, setNewBatchPeriodEnd] = useState("");
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [createResult, setCreateResult] = useState<string | undefined>(undefined);

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRowState((prev) => {
      const current = prev[id] ?? EMPTY_ROW_STATE;
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function handleCreateBatch(): void {
    setCreateError(undefined);
    setCreateResult(undefined);
    startTransition(async () => {
      const result = await createPayoutBatchAction({
        unitId: newBatchUnitId,
        periodStartISO: newBatchPeriodStart,
        periodEndISO: newBatchPeriodEnd,
      });
      if (result.ok) {
        setCreateResult(
          `Lote criado (id ${result.data.payoutBatchId}) — líquido ${format(money(result.data.netAmountCents, "BRL"))}.`,
        );
      } else {
        setCreateError(result.error);
      }
    });
  }

  function handleSubmitForApproval(batchId: string): void {
    patchRow(batchId, { submitting: true, error: undefined });
    startTransition(async () => {
      const result = await submitPayoutBatchForApprovalAction({ payoutBatchId: batchId });
      if (result.ok) {
        patchRow(batchId, {
          submitting: false,
          currentStatus: "pending_approval",
          requiredApprovals: result.data.requiredApprovals,
          stepUpChallenge: result.data.stepUpChallenge,
          error: undefined,
        });
      } else {
        patchRow(batchId, { submitting: false, error: result.error });
      }
    });
  }

  function handleApprove(batchId: string, stepUpToken: string | undefined): void {
    patchRow(batchId, { approving: true, error: undefined });
    startTransition(async () => {
      const result = await approvePayoutBatchAction({
        payoutBatchId: batchId,
        ...(stepUpToken ? { stepUpToken } : {}),
      });
      if (result.ok) {
        patchRow(batchId, { approving: false, currentStatus: "approved", error: undefined });
      } else {
        patchRow(batchId, { approving: false, error: result.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-medium text-fg">Apurar novo lote de repasse</h2>
        <p className="mb-3 text-xs text-fg-muted">
          O valor líquido é sempre recalculado no servidor a partir do contrato de administração
          vigente e da receita bruta confirmada do período — nunca aceito do formulário.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Unidade (id)
            <input
              value={newBatchUnitId}
              onChange={(e) => setNewBatchUnitId(e.target.value)}
              placeholder="uuid da unidade"
              className="w-64 rounded-control border border-border bg-bg p-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Início do período
            <input
              type="date"
              value={newBatchPeriodStart}
              onChange={(e) => setNewBatchPeriodStart(e.target.value)}
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Fim do período
            <input
              type="date"
              value={newBatchPeriodEnd}
              onChange={(e) => setNewBatchPeriodEnd(e.target.value)}
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <button
            type="button"
            disabled={isPending || !newBatchUnitId || !newBatchPeriodStart || !newBatchPeriodEnd}
            onClick={handleCreateBatch}
            className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
          >
            Apurar lote
          </button>
        </div>
        {createResult ? <p className="mt-2 text-xs text-positive">{createResult}</p> : null}
        {createError ? <p className="mt-2 text-xs text-negative">{createError}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-label text-fg-muted">
              <th className="px-4 py-3 font-medium">Unidade</th>
              <th className="px-4 py-3 font-medium">Período</th>
              <th className="px-4 py-3 font-medium">Bruto</th>
              <th className="px-4 py-3 font-medium">Comissão</th>
              <th className="px-4 py-3 font-medium">Despesas</th>
              <th className="px-4 py-3 font-medium">Líquido</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((batch) => {
              const state = rowState[batch.id] ?? EMPTY_ROW_STATE;
              const status = state.currentStatus ?? batch.status;

              return (
                <tr key={batch.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 align-top">
                    <div className="text-fg">{batch.unitName}</div>
                    <div className="font-mono text-xs text-fg-muted">{batch.unitId}</div>
                  </td>
                  <td className="px-4 py-3 align-top tabular-figures">
                    {formatCivilDate(batch.periodStart)} – {formatCivilDate(batch.periodEnd)}
                  </td>
                  <td className="px-4 py-3 align-top tabular-figures">
                    {format(money(batch.grossAmountCents, batch.currency))}
                  </td>
                  <td className="px-4 py-3 align-top tabular-figures">
                    {format(money(batch.commissionAmountCents, batch.currency))}
                  </td>
                  <td className="px-4 py-3 align-top tabular-figures">
                    {format(money(batch.expensesAmountCents, batch.currency))}
                  </td>
                  <td className="px-4 py-3 align-top tabular-figures font-medium">
                    {format(money(batch.netAmountCents, batch.currency))}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {status === "draft" ? (
                      <button
                        type="button"
                        disabled={isPending || state.submitting}
                        onClick={() => handleSubmitForApproval(batch.id)}
                        className="rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                      >
                        Enviar para aprovação
                      </button>
                    ) : null}

                    {status === "pending_approval" ? (
                      <div className="flex flex-col gap-2">
                        {state.stepUpChallenge ? (
                          <div className="w-72 rounded-control border border-warning/40 bg-warning/10 p-3 text-xs">
                            <p className="mb-1 font-medium text-fg">
                              Confirme antes de aprovar — step-up obrigatório (seção 9.4.1)
                            </p>
                            <p className="text-fg-muted">
                              Unidade: <span className="text-fg">{batch.unitName}</span>
                            </p>
                            <p className="text-fg-muted">
                              Total líquido:{" "}
                              <span className="tabular-figures font-medium text-fg">
                                {format(money(batch.netAmountCents, batch.currency))}
                              </span>
                            </p>
                            <p className="mt-1 text-[11px] text-fg-muted">
                              Sem múltiplos beneficiários por lote nem histórico de conta bancária
                              modelados ainda nesta fase — dívida técnica documentada.
                            </p>
                            <input
                              value={state.stepUpTokenInput}
                              onChange={(e) => patchRow(batch.id, { stepUpTokenInput: e.target.value })}
                              placeholder="Token de step-up recebido"
                              className="mt-2 w-full rounded-control border border-border bg-bg p-2 text-xs text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
                            />
                          </div>
                        ) : null}
                        <button
                          type="button"
                          disabled={
                            isPending ||
                            state.approving ||
                            (state.stepUpChallenge !== undefined && state.stepUpTokenInput.trim().length === 0)
                          }
                          onClick={() =>
                            handleApprove(
                              batch.id,
                              state.stepUpChallenge !== undefined ? state.stepUpTokenInput : undefined,
                            )
                          }
                          className="self-start rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                        >
                          Aprovar
                        </button>
                      </div>
                    ) : null}

                    {state.error ? <p className="mt-1 max-w-64 text-xs text-negative">{state.error}</p> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
