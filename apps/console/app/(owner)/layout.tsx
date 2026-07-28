"use client";

// Layout do portal do proprietário — mesmo AppShell do cockpit, seções de navegação diferentes.
// Rotas vivem sob `/portal/*` (decisão desta faixa: route groups não adicionam segmento de URL,
// então `(staff)/` e `(owner)/` colidiriam em "/" se ambos ficassem na raiz — ver relatório final).
import { usePathname } from "next/navigation";
import { AppShell } from "@titan/ui";
import { ownerNavSections } from "@/lib/nav";

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell
      sections={ownerNavSections}
      activePath={pathname}
      header={
        <div>
          <div className="text-sm font-semibold tracking-tight text-fg">Titan Stay</div>
          <div className="text-xs text-fg-muted">Portal do proprietário</div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
