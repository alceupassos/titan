"use client";

// Layout do portal do prestador — mesmo AppShell do cockpit/Owner Portal, seções de navegação
// diferentes (Fase 7, Passo 4a — docs/fase-atual.md). Rotas vivem sob `/portal-prestador/*`, não
// `/portal/*` — decisão de nomenclatura registrada em apps/console/lib/nav.ts (colisão com o
// Owner Portal, que já ocupa `/portal/*` desde a Fase 5): route groups não adicionam segmento de
// URL, então `(owner)/portal` e `(vendor)/portal` colidiriam na mesma rota "/portal" se os dois
// route groups usassem o mesmo nome de pasta.
import { usePathname } from "next/navigation";
import { AppShell } from "@titan/ui";
import { vendorNavSections } from "@/lib/nav";

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell
      sections={vendorNavSections}
      activePath={pathname}
      header={
        <div>
          <div className="text-sm font-semibold tracking-tight text-fg">Titan Stay</div>
          <div className="text-xs text-fg-muted">Portal do prestador</div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
