// Sidebar Nav Item — DESIGN.md §5: sempre com rótulo de texto, nunca só ícone. Estado ativo
// marcado pelo acento no indicador, não pela linha inteira.
import type { ReactNode } from "react";

export type NavItemDensity = "compact" | "comfortable";

export interface NavItemProps {
  href: string;
  active?: boolean;
  /** Compacto usa --row-compact (40px); confortável usa --row-comfortable (56px). */
  density?: NavItemDensity;
  children: ReactNode;
}

const DENSITY_CLASS: Record<NavItemDensity, string> = {
  compact: "h-[var(--row-compact)]",
  comfortable: "h-[var(--row-comfortable)]",
};

export function NavItem({ href, active = false, density = "compact", children }: NavItemProps) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-control px-3 text-sm font-medium transition-colors duration-100 ${DENSITY_CLASS[density]} ${
        active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-pill ${active ? "bg-accent" : "bg-fg-muted/40"}`} />
      <span className="truncate">{children}</span>
    </a>
  );
}
