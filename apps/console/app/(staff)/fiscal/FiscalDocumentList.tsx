"use client";

// Lista de documentos fiscais com ação de reprocesso/cancelamento (Fase 4, Passo 4c). Client
// component porque cada linha tem estado próprio (motivo de cancelamento, transição pendente,
// resultado da decisão) — mesmo padrão de
// apps/console/app/(staff)/distribuicao/DivergenceList.tsx e
// apps/console/app/(staff)/aprovacoes/ApprovalQueueTable.tsx. Os dados recebidos via props são
// AMOSTRA ESTÁTICA (../sample-data.ts); as ações chamadas (`retryInvoiceIssuanceAction`,
// `cancelInvoiceAction`, ./actions.ts) são as Server Actions reais, contra o banco.
import { useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import { format, money } from "@titan/money";
import type { fiscalDocuments } from "@titan/db";
import { cancelInvoiceAction, retryInvoiceIssuanceAction } from "./actions";

type FiscalDocumentRow = typeof fiscalDocuments.$inferSelect;

// Rótulo/tom cobre também os valores informais gravados pelas próprias Server Actions desta
// faixa ("retry_requested" — ver ./actions.ts::retryInvoiceIssuanceAction) além dos valores do
// domínio (`InvoiceStatus`, packages/domain/src/fiscal/service-invoice.ts).
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  issued: "Emitida",
  rejected: "Rejeitada",
  cancelled: "Cancelada",
  substituted: "Substituída",
  retry_requested: "Reprocesso solicitado",
};

// The Status-Needs-Text Rule (DESIGN.md §2): cor semântica sempre com texto. `issued` é o único
// estado "positivo" de verdade (nota válida em circulação); `rejected`/`cancelled` são negativos;
// `pending`/`retry_requested` são neutro-informativos (aguardando o worker, não é erro).
const STATUS_TONE: Record<string, StatusTone> = {
  pending: "info",
  issued: "positive",
  rejected: "negative",
  cancelled: "negative",
  substituted: "info",
  retry_requested: "info",
};

const CREATED_AT_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

interface RowState {
  cancelling: boolean;
  reason: string;
  error: string | undefined;
  newStatus: string | undefined;
}

export interface FiscalDocumentListProps {
  documents: readonly FiscalDocumentRow[];
}

export function FiscalDocumentList({ documents }: FiscalDocumentListProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRowState((prev) => {
      const current: RowState = prev[id] ?? {
        cancelling: false,
        reason: "",
        error: undefined,
        newStatus: undefined,
      };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function submitRetry(fiscalDocumentId: string): void {
    startTransition(async () => {
      const result = await retryInvoiceIssuanceAction({ fiscalDocumentId });
      if (result.ok) {
        patchRow(fiscalDocumentId, { error: undefined, newStatus: result.data.status });
      } else {
        patchRow(fiscalDocumentId, { error: result.error });
      }
    });
  }

  function submitCancel(fiscalDocumentId: string): void {
    const reason = rowState[fiscalDocumentId]?.reason.trim() ?? "";
    startTransition(async () => {
      const result = await cancelInvoiceAction({ fiscalDocumentId, reason });
      if (result.ok) {
        patchRow(fiscalDocumentId, { error: undefined, newStatus: result.data.status, cancelling: false });
      } else {
        patchRow(fiscalDocumentId, { error: result.error });
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-label text-fg-muted">
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Emitida em</th>
            <th className="px-4 py-3 font-medium">Código de serviço</th>
            <th className="px-4 py-3 font-medium">Base</th>
            <th className="px-4 py-3 font-medium">ISS</th>
            <th className="px-4 py-3 font-medium">Documentos</th>
            <th className="px-4 py-3 font-medium">Ação</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const state = rowState[doc.id];
            const effectiveStatus = state?.newStatus ?? doc.status;
            const canRetry = effectiveStatus === "pending" || effectiveStatus === "rejected";
            const canCancel = effectiveStatus === "issued";

            return (
              <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3 align-top">
                  <StatusPill tone={STATUS_TONE[effectiveStatus] ?? "info"}>
                    {STATUS_LABEL[effectiveStatus] ?? effectiveStatus}
                  </StatusPill>
                  {doc.status === "rejected" && doc.rejectionReason ? (
                    <p className="mt-1 max-w-xs text-xs text-fg-muted">{doc.rejectionReason}</p>
                  ) : null}
                </td>
                <td className="px-4 py-3 align-top tabular-figures">
                  {doc.issuedAt ? CREATED_AT_FORMATTER.format(doc.issuedAt) : "—"}
                </td>
                <td className="px-4 py-3 align-top tabular-figures">{doc.serviceCode}</td>
                <td className="px-4 py-3 align-top tabular-figures">
                  {format(money(doc.baseAmountCents, doc.currency as "BRL" | "USD" | "EUR"))}
                </td>
                <td className="px-4 py-3 align-top tabular-figures">
                  {format(money(doc.taxAmountCents, doc.currency as "BRL" | "USD" | "EUR"))}
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-col gap-1 text-xs text-fg-muted">
                    {doc.xmlStorageRef ? (
                      <a href={doc.xmlStorageRef} className="underline decoration-dotted hover:text-fg">
                        XML
                      </a>
                    ) : (
                      <span>XML — ainda não emitido</span>
                    )}
                    {doc.pdfStorageRef ? (
                      <a href={doc.pdfStorageRef} className="underline decoration-dotted hover:text-fg">
                        PDF
                      </a>
                    ) : (
                      <span>PDF — ainda não emitido</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  {!canRetry && !canCancel ? (
                    <span className="text-xs text-fg-muted">Sem ação disponível neste estado.</span>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        {canRetry ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => submitRetry(doc.id)}
                            className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                            title="Solicita novo envio ao provedor — execução real pendente do worker, ver ./actions.ts."
                          >
                            Reprocessar
                          </button>
                        ) : null}
                        {canCancel ? (
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => patchRow(doc.id, { cancelling: !state?.cancelling })}
                            className="rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        ) : null}
                      </div>
                      {state?.cancelling ? (
                        <div className="flex flex-col gap-1.5">
                          <textarea
                            value={state.reason}
                            onChange={(e) => patchRow(doc.id, { reason: e.target.value })}
                            placeholder="Motivo obrigatório do cancelamento — nunca um cancelamento silencioso."
                            rows={2}
                            className="w-64 rounded-control border border-border bg-bg p-2 text-xs text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
                          />
                          <button
                            type="button"
                            disabled={isPending || state.reason.trim().length === 0}
                            onClick={() => submitCancel(doc.id)}
                            className="self-start rounded-control bg-negative px-3 py-1.5 text-xs font-medium text-fg transition-colors duration-100 hover:bg-negative/90 disabled:opacity-50"
                          >
                            Confirmar cancelamento
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
