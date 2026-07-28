import Link from "next/link";
import { format as formatMoney } from "@titan/money";
import { Badge } from "./ui/Badge";
import type { UnitSummary } from "@/lib/queries";

// Unit Card — DESIGN.md §5, componente de assinatura do storefront. Única superfície do sistema
// com elevação em repouso (`shadow-card-rest`), por design (diferente do cockpit).
export function UnitCard({ unit, hrefSuffix = "" }: { unit: UnitSummary; hrefSuffix?: string }) {
  return (
    <Link
      href={`/unidades/${unit.id}${hrefSuffix}`}
      className="group block overflow-hidden rounded-card bg-surface shadow-[var(--shadow-card-rest)] transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]"
    >
      {/* Placeholder de imagem — sem galeria/otimização real ainda (fora do escopo mínimo desta
          fase). Bloco de cor sólida é mais honesto do que fotografia de estoque fingindo ser a
          unidade real (PRODUCT.md — Anti-references). */}
      <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 text-ink-muted">
        <span className="text-xs">Foto real em breve</span>
      </div>
      <div className="space-y-2 p-5">
        <h3 className="font-display text-lg text-ink">{unit.name}</h3>
        <Badge tone="positive">Disponível</Badge>
        {unit.fromNightlyPrice ? (
          <p className="text-sm text-ink-muted">
            a partir de{" "}
            <span className="tabular-figures font-medium text-ink">{formatMoney(unit.fromNightlyPrice)}</span>
            /noite
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Tarifa sob consulta</p>
        )}
      </div>
    </Link>
  );
}
