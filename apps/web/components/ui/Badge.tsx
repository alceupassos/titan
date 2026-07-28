// Availability Badge — DESIGN.md §5. Mesma regra do StatusPill do cockpit: cor semântica +
// texto sempre presente, nunca cor isolada (The Status-Needs-Text Rule).
export type BadgeTone = "positive" | "warning" | "negative" | "info";

const TONE_CLASS: Record<BadgeTone, string> = {
  positive: "bg-positive/15 text-[oklch(0.32_0.09_155)]",
  warning: "bg-warning/20 text-[oklch(0.34_0.09_80)]",
  negative: "bg-negative/15 text-[oklch(0.3_0.1_25)]",
  info: "bg-info/15 text-[oklch(0.28_0.06_250)]",
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-pill px-3 py-1 text-xs font-medium ${TONE_CLASS[tone]}`}>
      {children}
    </span>
  );
}
