// I4 — "Nenhum dado de cartão trafega ou repousa na aplicação" / "teste que falha o build se
// padrão de PAN aparecer em log" (docs/invariantes.md). Este adapter cobre só PIX (cartão
// internacional é o adapter Stripe, faixa paralela, com o teste equivalente em
// ../stripe/i4-no-card-data.test.ts), então nenhum arquivo aqui — fonte ou fixture — deveria
// jamais precisar de um número de 13-19 dígitos consecutivos. Mesmo espírito do hook
// `.claude/hooks/block-secrets.mjs`, como teste automatizado específico deste pacote.
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ASAAS_DIR = fileURLToPath(new URL(".", import.meta.url));

// 13-19 dígitos consecutivos (com ou sem espaço/hífen a cada 4) é o formato geral de PAN
// (ISO/IEC 7812) coberto pelas principais bandeiras — regra simples e propositalmente ampla:
// falso positivo aqui custa pouco (ajustar uma fixture), falso negativo custa uma violação de
// I4 não detectada.
const PAN_PATTERN = /\b(?:\d[ -]?){13,19}\b/;

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (![".ts", ".json"].includes(extname(entry.name))) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

describe("I4 — nenhum padrão de PAN no adapter Asaas", () => {
  it("varre todo .ts/.json de packages/payments/src/asaas em busca de sequência de 13-19 dígitos", () => {
    const files = collectSourceFiles(ASAAS_DIR);
    // Falha alto (build-time) se este diretório ficar vazio por engano de refactor — o teste
    // existir sem nada para varrer daria falso verde silencioso.
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const match = content.match(PAN_PATTERN);
      if (match) {
        offenders.push(`${file}: "${match[0]}"`);
      }
    }

    expect(offenders, `Padrão de PAN encontrado (I4):\n${offenders.join("\n")}`).toEqual([]);
  });
});
