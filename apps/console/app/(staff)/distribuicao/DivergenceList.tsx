"use client";

// Lista de divergências abertas com correção assistida (Fase 3, Passo 4d). Client component
// porque cada linha tem estado próprio (nota opcional, transição pendente, resultado da decisão)
// — mesmo padrão de apps/console/app/(staff)/aprovacoes/ApprovalQueueTable.tsx. Os dados recebidos
// via props são AMOSTRA ESTÁTICA (../sample-data.ts); a ação chamada (`resolveDivergenceAction`,
// ./actions.ts) é a Server Action real, contra o banco.
import { useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import type { divergences } from "@titan/db";
import { resolveDivergenceAction } from "./actions";

type DivergenceRow = typeof divergences.$inferSelect;

const KIND_LABEL: Record<string, string> = {
  availability_mismatch: "Disponibilidade divergente",
  rate_mismatch: "Tarifa divergente",
  unmapped_reservation: "Reserva sem mapeamento",
};

const CHANNEL_LABEL: Record<string, string> = {
  direct: "Direto",
  airbnb: "Airbnb",
  booking: "Booking",
  vrbo: "VRBO",
  expedia: "Expedia",
};

// The Status-Needs-Text Rule (DESIGN.md §2): cor semântica sempre com texto. `unmapped_reservation`
// é o caso mais grave (reserva existe sem termos rastro nenhum do lado local) -> `negative`;
// os outros dois são divergência de dado sincronizável -> `warning`.
const KIND_TONE: Record<string, StatusTone> = {
  availability_mismatch: "warning",
  rate_mismatch: "warning",
  unmapped_reservation: "negative",
};

interface RowState {
  note: string;
  error: string | undefined;
  resolved: boolean;
}

export interface DivergenceListProps {
  divergences: readonly DivergenceRow[];
}

export function DivergenceList({ divergences: rows }: DivergenceListProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRowState((prev) => {
      const current: RowState = prev[id] ?? { note: "", error: undefined, resolved: false };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function submitResolution(divergenceId: string, resolution: "accept_remote" | "accept_local"): void {
    const note = rowState[divergenceId]?.note.trim();
    startTransition(async () => {
      const result = await resolveDivergenceAction({
        divergenceId,
        resolution,
        note: note ? note : undefined,
      });
      if (result.ok) {
        patchRow(divergenceId, { error: undefined, resolved: true });
      } else {
        patchRow(divergenceId, { error: result.error });
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-label text-fg-muted">
            <th className="px-4 py-3 font-medium">Canal</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Data</th>
            <th className="px-4 py-3 font-medium">Detalhe</th>
            <th className="px-4 py-3 font-medium">Correção</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const state = rowState[row.id];
            const detail = (row.detail ?? {}) as Record<string, unknown>;

            return (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3 align-top">{CHANNEL_LABEL[row.channel] ?? row.channel}</td>
                <td className="px-4 py-3 align-top">
                  <StatusPill tone={KIND_TONE[row.kind] ?? "info"}>{KIND_LABEL[row.kind] ?? row.kind}</StatusPill>
                </td>
                <td className="px-4 py-3 align-top tabular-figures">{row.date ?? "—"}</td>
                <td className="px-4 py-3 align-top max-w-sm text-fg-muted">
                  <code className="text-xs">{JSON.stringify(detail)}</code>
                </td>
                <td className="px-4 py-3 align-top">
                  {state?.resolved ? (
                    <StatusPill tone="positive">Resolvida</StatusPill>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => submitResolution(row.id, "accept_remote")}
                          className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                          title="Aceita o valor visto no canal como correto — corrige o dado local (execução real pendente de packages/channels, ver ./actions.ts)."
                        >
                          Aceitar remoto
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => submitResolution(row.id, "accept_local")}
                          className="rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                          title="Aceita o dado local como correto — reenvia (push) para o canal (execução real pendente de packages/channels, ver ./actions.ts)."
                        >
                          Aceitar local
                        </button>
                      </div>
                      <textarea
                        value={state?.note ?? ""}
                        onChange={(e) => patchRow(row.id, { note: e.target.value })}
                        placeholder="Nota opcional para a decisão."
                        rows={1}
                        className="w-64 rounded-control border border-border bg-bg p-2 text-xs text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
                      />
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
