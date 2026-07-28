// Sidebar do cockpit — DESIGN.md §5 "Navigation": sidebar com rótulos, nunca barra de ícones sem
// texto. Compõe `NavItem` (indicador de estado ativo via ponto verde). Componente puro (sem
// hooks) — quem decide `activePath`/`density` é o consumidor (ex.: AppShell), então este arquivo
// não precisa de "use client" e pode ser renderizado no servidor.
import type { ReactNode } from "react";
import { NavItem, type NavItemDensity } from "./NavItem";

export interface SidebarLink {
  href: string;
  label: string;
}

export interface SidebarSection {
  title: string;
  items: SidebarLink[];
}

export interface SidebarProps {
  sections: SidebarSection[];
  activePath: string;
  density?: NavItemDensity;
  /** Topo do sidebar — nome do produto/contexto (cockpit vs. portal do proprietário). */
  header?: ReactNode;
  /** Rodapé do sidebar — ex.: `DensityToggle`. */
  footer?: ReactNode;
}

function isActive(href: string, activePath: string): boolean {
  if (href === "/") return activePath === "/";
  return activePath === href || activePath.startsWith(`${href}/`);
}

export function Sidebar({ sections, activePath, density = "compact", header, footer }: SidebarProps) {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-border bg-surface">
      {header ? <div className="px-4 py-4">{header}</div> : null}
      <nav className="flex-1 overflow-y-auto px-2 py-2" aria-label="Navegação principal">
        {sections.map((section) => (
          <div key={section.title} className="mb-4">
            <div className="text-label px-3 pb-1 pt-2 text-fg-muted">{section.title}</div>
            <div className="flex flex-col gap-0.5">
              {section.items.map((item) => (
                <NavItem key={item.href} href={item.href} active={isActive(item.href, activePath)} density={density}>
                  {item.label}
                </NavItem>
              ))}
            </div>
          </div>
        ))}
      </nav>
      {footer ? <div className="border-t border-border px-3 py-3">{footer}</div> : null}
    </aside>
  );
}
