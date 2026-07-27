import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Titan Stay — Cockpit",
  description: "Cockpit de gestão Titan Empreendimentos",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
