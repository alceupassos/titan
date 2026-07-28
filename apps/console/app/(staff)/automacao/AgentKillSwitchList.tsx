"use client";

// Lista de kill switches por agente (Fase 10, Passo 4b). Client component porque cada linha
// dispara `toggleAgentKillSwitchAction` (./actions.ts) — mesmo padrão de
// ../aprovacoes/ApprovalQueueTable.tsx (useTransition + estado por linha), nunca um formulário
// completo: aqui é só ligar/desligar (guardrail #10 do ADR-0009), duas opções, não uma fila de
// decisão.
import { useState, useTransition } from "react";
import { StatusPill } from "@titan/ui";
import { toggleAgentKillSwitchAction } from "./actions";
import type { SampleAgentKillSwitch } from "./sample-data";

export interface AgentKillSwitchListProps {
  killSwitches: readonly SampleAgentKillSwitch[];
}

interface RowState {
  enabled: boolean;
  error: string | undefined;
}

export function AgentKillSwitchList({ killSwitches }: AgentKillSwitchListProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(killSwitches.map((ks) => [ks.agentName, { enabled: ks.enabled, error: undefined }])),
  );
  const [isPending, startTransition] = useTransition();

  function toggle(agentName: string, nextEnabled: boolean): void {
    startTransition(async () => {
      const result = await toggleAgentKillSwitchAction({ agentName, enabled: nextEnabled });
      if (result.ok) {
        setRowState((prev) => ({ ...prev, [agentName]: { enabled: result.data.enabled, error: undefined } }));
      } else {
        setRowState((prev) => ({ ...prev, [agentName]: { ...prev[agentName]!, error: result.error } }));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {killSwitches.map((ks) => {
        const state = rowState[ks.agentName] ?? { enabled: ks.enabled, error: undefined };
        return (
          <div
            key={ks.agentName}
            className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-fg">{ks.agentName}</span>
              <StatusPill tone={state.enabled ? "positive" : "negative"}>
                {state.enabled ? "Ativo" : "Desligado"}
              </StatusPill>
            </div>
            <div className="flex flex-col items-end gap-1">
              <button
                type="button"
                disabled={isPending}
                onClick={() => toggle(ks.agentName, !state.enabled)}
                className="rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
              >
                {state.enabled ? "Desligar" : "Ligar"}
              </button>
              {state.error ? <p className="max-w-64 text-xs text-negative">{state.error}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
