"use client";

// Layout do cockpit (papéis `titan.*`) — monta AppShell (Sidebar + densidade) em volta de todas
// as rotas de staff. "use client" só por causa de `usePathname()`; `children` (cada page.tsx)
// continua podendo ser Server Component — a fronteira de client component não se propaga para
// os filhos já renderizados pelo servidor.
import { usePathname } from "next/navigation";
import { AppShell } from "@titan/ui";
import { staffNavSections } from "@/lib/nav";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AppShell
      sections={staffNavSections}
      activePath={pathname}
      header={
        <div>
          <div className="text-sm font-semibold tracking-tight text-fg">Titan Stay</div>
          <div className="text-xs text-fg-muted">Cockpit</div>
        </div>
      }
    >
      {children}
    </AppShell>
  );
}
