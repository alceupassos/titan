// Status Pill — DESIGN.md "The Status-Needs-Text Rule": cor semântica SEMPRE com texto, nunca cor
// isolada.
// `info` (Fase 2, Passo 4 — fila de aprovações, apps/console/app/(staff)/aprovacoes): usa o token
// `--color-info` de packages/ui/src/styles/theme.css, já definido em DESIGN.md §2 mas sem nenhum
// componente que o consumisse até aqui — risco `low` precisa de um tom neutro-informativo
// distinto de `warning`/`negative`, não decoração.
export type StatusTone = "positive" | "negative" | "warning" | "info";

export interface StatusPillProps {
  tone: StatusTone;
  children: string;
}

const TONE_CLASS: Record<StatusTone, string> = {
  positive: "bg-positive text-accent-fg",
  negative: "bg-negative text-fg",
  warning: "bg-warning text-accent-fg",
  info: "bg-info text-fg",
};

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}
