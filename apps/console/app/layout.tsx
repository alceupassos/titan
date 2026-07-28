import type { Metadata } from "next";
import { CommandPalette } from "@/components/CommandPalette";
import { allNavSections } from "@/lib/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Titan Stay — Cockpit",
  description: "Cockpit de gestão Titan Empreendimentos",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        {/* Montado uma única vez, fora dos layouts de grupo — funciona tanto em (staff) quanto
            em (owner) e não depende de estar dentro do AppShell. */}
        <CommandPalette sections={allNavSections} />
      </body>
    </html>
  );
}
