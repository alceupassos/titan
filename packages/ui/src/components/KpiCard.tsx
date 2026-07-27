// KPI Card — DESIGN.md §5 "Components". Plano em repouso (The Interaction-Only Lift Rule),
// máximo 4 por linha, estados de carregando/vazio/erro/parcial obrigatórios.
import type { ReactNode } from "react";

export type KpiCardState = "ready" | "loading" | "empty" | "error" | "partial";

export interface KpiCardProps {
  label: string;
  value?: string;
  /** Sinal de variação, ex.: "+6.25%". Cor semântica derivada de `trend`. */
  delta?: string;
  trend?: "up" | "down" | "flat";
  state?: KpiCardState;
  sparkline?: ReactNode;
}

const TREND_CLASS: Record<NonNullable<KpiCardProps["trend"]>, string> = {
  up: "bg-positive/18 text-positive",
  down: "bg-negative/18 text-negative",
  flat: "bg-fg-muted/18 text-fg-muted",
};

export function KpiCard({ label, value, delta, trend = "flat", state = "ready", sparkline }: KpiCardProps) {
  if (state === "loading") {
    return (
      <div className="animate-pulse rounded-card bg-surface p-5">
        <div className="mb-2 h-3 w-24 rounded bg-surface-2" />
        <div className="h-8 w-32 rounded bg-surface-2" />
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div className="rounded-card bg-surface p-5 text-fg-muted">
        <div className="text-label">{label}</div>
        <div className="mt-2 text-sm">Sem dados neste período.</div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="rounded-card bg-surface p-5">
        <div className="text-label text-fg-muted">{label}</div>
        <div className="mt-2 text-sm text-negative">Não foi possível carregar.</div>
      </div>
    );
  }

  return (
    <div
      className="rounded-card border border-border bg-surface p-5 transition-shadow duration-200 ease-[var(--ease-standard)] hover:shadow-[0_4px_16px_oklch(0_0_0_/_24%)]"
      data-partial={state === "partial" || undefined}
    >
      <div className="text-label text-fg-muted">{label}</div>
      <div className="mt-2 flex items-baseline gap-3">
        <span className="tabular-figures text-2xl font-semibold tracking-[-0.01em]">{value}</span>
        {delta ? (
          <span className={`tabular-figures rounded-pill px-2 py-0.5 text-xs ${TREND_CLASS[trend]}`}>
            {delta}
          </span>
        ) : null}
      </div>
      {sparkline ? <div className="mt-3 h-8">{sparkline}</div> : null}
      {state === "partial" ? (
        <div className="mt-2 text-xs text-warning">Dado parcial — algumas fontes ainda não sincronizaram.</div>
      ) : null}
    </div>
  );
}
