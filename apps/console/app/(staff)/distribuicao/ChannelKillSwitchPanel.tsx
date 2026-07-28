"use client";

// Kill switch manual por canal (ADR-0020 — mitigação de risco EXIGIDA para o adapter de
// automação via navegador do Airbnb). Este toggle é VISUAL — a Server Action
// (`toggleChannelAdapterAction`, ./actions.ts) sempre devolve erro explícito hoje, porque não
// existe ainda onde persistir o estado "desligado" para o worker/adapter consultarem (falta a
// tabela `channel_adapter_config`, fora do escopo de `packages/db` nesta faixa). O toggle nunca
// aparece como "desligado com sucesso" — sempre volta para a posição original e mostra o motivo,
// nunca finge que funcionou.
import { useState, useTransition } from "react";
import { StatusPill } from "@titan/ui";
import type { ChannelValue } from "@titan/contracts";
import { toggleChannelAdapterAction } from "./actions";

const CHANNEL_LABEL: Record<string, string> = {
  direct: "Direto",
  airbnb: "Airbnb",
  booking: "Booking",
  vrbo: "VRBO",
  expedia: "Expedia",
};

interface ChannelState {
  error: string | undefined;
}

export interface ChannelKillSwitchPanelProps {
  channels: readonly ChannelValue[];
  connectedChannels: ReadonlySet<string>;
}

export function ChannelKillSwitchPanel({ channels, connectedChannels }: ChannelKillSwitchPanelProps) {
  const [state, setState] = useState<Record<string, ChannelState>>({});
  const [isPending, startTransition] = useTransition();

  function submitToggle(channel: ChannelValue, enabled: boolean): void {
    startTransition(async () => {
      const result = await toggleChannelAdapterAction({ channel, enabled });
      // `result.ok` nunca é `true` hoje (ver cabeçalho do arquivo) — o branch existe só para não
      // deixar o tipo `ActionResult<never>` sem tratamento honesto caso isso mude no futuro.
      if (!result.ok) {
        setState((prev) => ({ ...prev, [channel]: { error: result.error } }));
      }
    });
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="mb-4 text-sm text-fg-muted">
        Kill switch por canal (ADR-0020) — desliga um adapter específico sem precisar de deploy.
        <span className="text-warning"> Ainda não persiste de verdade nesta fase</span> — ver motivo abaixo de
        cada canal ao acionar.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {channels.map((channel) => {
          const connected = connectedChannels.has(channel);
          const channelState = state[channel];
          return (
            <div key={channel} className="flex flex-col gap-1.5 rounded-control border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-fg">{CHANNEL_LABEL[channel] ?? channel}</span>
                <div className="flex items-center gap-2">
                  <StatusPill tone={connected ? "positive" : "info"}>{connected ? "Conectado" : "Sem mapeamento"}</StatusPill>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={connected}
                    disabled={isPending}
                    onClick={() => submitToggle(channel, !connected)}
                    className="rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                  >
                    {connected ? "Desligar" : "Religar"}
                  </button>
                </div>
              </div>
              {channelState?.error ? <p className="text-xs text-negative">{channelState.error}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
