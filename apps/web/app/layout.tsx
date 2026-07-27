import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Titan Stay",
  description: "Aluguel de temporada",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
