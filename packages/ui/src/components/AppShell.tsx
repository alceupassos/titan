"use client";

// Casca do cockpit — monta Sidebar + área de conteúdo, dono do estado de densidade (persistido em
// localStorage; ver DENSITY_STORAGE_KEY). Cliente porque precisa de estado + `localStorage`; a
// página de cada rota (`children`) continua podendo ser Server Component normalmente — o limite
// de client component começa aqui, não se propaga para baixo.
import { useEffect, useState, type ReactNode } from "react";
import { DensityToggle, type Density } from "./DensityToggle";
import { Sidebar, type SidebarSection } from "./Sidebar";

const DENSITY_STORAGE_KEY = "titan-console-density";

export interface AppShellProps {
  sections: SidebarSection[];
  activePath: string;
  header?: ReactNode;
  children: ReactNode;
}

function readStoredDensity(): Density {
  if (typeof window === "undefined") return "compact";
  const stored = window.localStorage.getItem(DENSITY_STORAGE_KEY);
  return stored === "compact" || stored === "comfortable" ? stored : "compact";
}

export function AppShell({ sections, activePath, header, children }: AppShellProps) {
  const [density, setDensity] = useState<Density>("compact");

  // Lido só depois da montagem (evita divergência de hidratação — o servidor não conhece
  // localStorage do navegador).
  useEffect(() => {
    setDensity(readStoredDensity());
  }, []);

  useEffect(() => {
    window.localStorage.setItem(DENSITY_STORAGE_KEY, density);
  }, [density]);

  return (
    <div className="flex h-dvh w-full bg-bg text-fg">
      <Sidebar
        sections={sections}
        activePath={activePath}
        density={density}
        header={header}
        footer={<DensityToggle density={density} onChange={setDensity} />}
      />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
