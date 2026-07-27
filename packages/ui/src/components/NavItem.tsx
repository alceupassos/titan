// Sidebar Nav Item — DESIGN.md §5: sempre com rótulo de texto, nunca só ícone. Estado ativo
// marcado pelo acento no indicador, não pela linha inteira.
import type { ReactNode } from "react";

export interface NavItemProps {
  href: string;
  active?: boolean;
  children: ReactNode;
}

export function NavItem({ href, active = false, children }: NavItemProps) {
  return (
    <a
      href={href}
      className={`flex h-10 items-center gap-2.5 rounded-control px-3 text-sm font-medium transition-colors duration-100 ${
        active ? "bg-surface-2 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-pill ${active ? "bg-accent" : "bg-fg-muted/40"}`} />
      {children}
    </a>
  );
}
