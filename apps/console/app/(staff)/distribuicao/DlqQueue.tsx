"use client";

// Fila DLQ (itens de channel_sync_log com status "error") com reprocesso manual (Fase 3, Passo
// 4d — seção 9.2 do prompt único: "DLQ com reprocesso pelo cockpit"). Mesmo padrão de
// ./DivergenceList.tsx / apps/console/app/(staff)/aprovacoes/ApprovalQueueTable.tsx. A ação
// chamada (`retrySyncAction`, ./actions.ts) só GRAVA a intenção de reprocesso no banco
// (`status: "retry_requested"`) — o worker de verdade consumir isso é dívida técnica documentada
// em ./actions.ts, não algo que este componente finge que já acontece.
import { useState, useTransition } from "react";
import { StatusPill } from "@titan/ui";
import type { channelSyncLog } from "@titan/db";
import { retrySyncAction } from "./actions";

type ChannelSyncLogRow = typeof channelSyncLog.$inferSelect;

const CHANNEL_LABEL: Record<string, string> = {
  direct: "Direto",
  airbnb: "Airbnb",
  booking: "Booking",
  vrbo: "VRBO",
  expedia: "Expedia",
};

const DIRECTION_LABEL: Record<string, string> = {
  push: "Envio (push)",
  pull: "Recebimento (pull)",
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface RowState {
  error: string | undefined;
  requested: boolean;
}

export interface DlqQueueProps {
  entries: readonly ChannelSyncLogRow[];
}

export function DlqQueue({ entries }: DlqQueueProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRowState((prev) => {
      const current: RowState = prev[id] ?? { error: undefined, requested: false };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function submitRetry(channelSyncLogId: string): void {
    startTransition(async () => {
      const result = await retrySyncAction({ channelSyncLogId });
      if (result.ok) {
        patchRow(channelSyncLogId, { error: undefined, requested: true });
      } else {
        patchRow(channelSyncLogId, { error: result.error });
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-label text-fg-muted">
            <th className="px-4 py-3 font-medium">Canal</th>
            <th className="px-4 py-3 font-medium">Direção</th>
            <th className="px-4 py-3 font-medium">Quando</th>
            <th className="px-4 py-3 font-medium">Detalhe do erro</th>
            <th className="px-4 py-3 font-medium">Ação</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const state = rowState[entry.id];
            const detail = (entry.detail ?? {}) as Record<string, unknown>;

            return (
              <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3 align-top">{CHANNEL_LABEL[entry.channel] ?? entry.channel}</td>
                <td className="px-4 py-3 align-top">{DIRECTION_LABEL[entry.direction] ?? entry.direction}</td>
                <td className="px-4 py-3 align-top tabular-figures">
                  {TIMESTAMP_FORMATTER.format(entry.createdAt)}
                </td>
                <td className="px-4 py-3 align-top max-w-sm text-fg-muted">
                  <code className="text-xs">{JSON.stringify(detail)}</code>
                </td>
                <td className="px-4 py-3 align-top">
                  {state?.requested ? (
                    <StatusPill tone="info">Reprocesso solicitado</StatusPill>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => submitRetry(entry.id)}
                        className="self-start rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                        title="Grava um pedido de reprocesso no banco (status: retry_requested) — o worker consumir isso de fato é dívida técnica, ver ./actions.ts."
                      >
                        Reprocessar
                      </button>
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
