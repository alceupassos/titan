// Comparison Bar Chart — peça central da "pesquisa de comparação de preços" (comp set,
// `packages/domain/src/pricing/comp-set.ts::buildCompSet`/`medianCompSetPriceCents`). SVG puro,
// zero dependência (mesmo padrão de `Sparkline.tsx`/`TapeChart.tsx`, ADR-0018).
//
// Paleta: só a unidade-alvo (`highlight`) usa o acento verde — todo comparável neutro usa
// `fg-muted`/`border`, nunca um gradiente ou cor diferente por barra (DESIGN.md "The One Voice
// Rule" — o acento tem que ser raro para significar algo). A mediana do comp set é uma linha de
// referência tracejada em `info`, nunca confundida com dado real (mesma regra de hachura do
// Sparkline).
import { money, format, type CurrencyCode } from "@titan/money";

/** Inteiro em centavos — mesmo alias de `packages/domain/src/pricing/comp-set.ts` (Cents). */
type Cents = number;

export interface ComparisonBarChartItem {
  label: string;
  priceCents: Cents;
  /** Marca a unidade-alvo — só ela recebe o acento verde. */
  highlight?: boolean;
}

export interface ComparisonBarChartProps {
  items: readonly ComparisonBarChartItem[];
  /** Mediana do comp set (`medianCompSetPriceCents`) — desenhada como linha de referência. */
  medianCents?: Cents | null;
  currency?: CurrencyCode;
}

export function ComparisonBarChart({ items, medianCents, currency = "BRL" }: ComparisonBarChartProps) {
  if (items.length === 0) {
    return <p className="text-sm text-fg-muted">Sem comparáveis suficientes para o comp set.</p>;
  }

  const maxCents = Math.max(...items.map((item) => item.priceCents), medianCents ?? 0);
  const medianPercent = medianCents != null ? (medianCents / maxCents) * 100 : null;

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => {
        const widthPercent = (item.priceCents / maxCents) * 100;
        return (
          <div key={item.label} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-sm text-fg-muted">{item.label}</span>
            <div className="relative h-6 flex-1 rounded-[0.375rem] bg-surface-2">
              <div
                className={`h-full rounded-[0.375rem] ${item.highlight ? "bg-accent" : "bg-fg-muted/40"}`}
                style={{ width: `${Math.max(widthPercent, 2)}%` }}
              />
              {medianPercent != null ? (
                <div
                  className="absolute inset-y-0 border-l border-dashed border-info"
                  style={{ left: `${Math.min(medianPercent, 100)}%` }}
                  aria-hidden="true"
                />
              ) : null}
            </div>
            <span className="tabular-figures w-24 shrink-0 text-right text-sm">
              {format(money(item.priceCents, currency))}
            </span>
          </div>
        );
      })}
      {medianCents != null ? (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-fg-muted">
          <span className="inline-block h-0 w-3 border-t border-dashed border-info" aria-hidden="true" />
          Mediana do comp set: <span className="tabular-figures text-fg">{format(money(medianCents, currency))}</span>
        </div>
      ) : null}
    </div>
  );
}
