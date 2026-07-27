import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Modo correto para auto-hospedagem em VPS única (seção 5.1 do prompt único) — a imagem
  // Docker roda `node server.js` do output standalone, sem depender do CLI `next start`.
  output: "standalone",
  turbopack: {
    // Raiz explícita do monorepo — sem isso, o Turbopack tenta inferir a raiz e se confunde com
    // um package-lock.json solto em C:\Users\Alceu Passos (fora deste projeto).
    root: path.join(import.meta.dirname, "..", ".."),
  },
  // console.* nunca é indexado — reforça o que já é garantido por auth/proxy.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },
};

export default nextConfig;
