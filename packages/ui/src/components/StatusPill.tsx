// Status Pill — DESIGN.md "The Status-Needs-Text Rule": cor semântica SEMPRE com texto, nunca cor
// isolada.
export type StatusTone = "positive" | "negative" | "warning";

export interface StatusPillProps {
  tone: StatusTone;
  children: string;
}

const TONE_CLASS: Record<StatusTone, string> = {
  positive: "bg-positive text-accent-fg",
  negative: "bg-negative text-fg",
  warning: "bg-warning text-accent-fg",
};

export function StatusPill({ tone, children }: StatusPillProps) {
  return (
    <span className={`inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}
