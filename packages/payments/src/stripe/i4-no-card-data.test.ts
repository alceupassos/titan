import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * I4: "Nenhum dado de cartão trafega ou repousa na aplicação."
 *
 * Varre todo arquivo-fonte/fixture deste adapter (`packages/payments/src/stripe/`) por padrão
 * de número de cartão (PAN) e falha o build se encontrar. Mesmo espírito do teste equivalente
 * do adapter Asaas (faixa paralela) — arquivos disjuntos, sem necessidade de coordenação.
 *
 * Padrão: sequência de 13 a 19 dígitos, com ou sem espaços/hífens a cada 4 dígitos — cobre PAN
 * real e os números de cartão de teste mais comuns do Stripe (o clássico "cartão de teste Visa"
 * de 16 dígitos terminado em zeros, entre outros). Este próprio arquivo é varrido junto — por
 * isso a descrição acima evita citar qualquer número de teste por extenso.
 */

const CARD_NUMBER_PATTERN = /\b(?:\d[ -]?){12,18}\d\b/;

const STRIPE_DIR = dirname(fileURLToPath(import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx|json)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("I4 — nenhum dado de cartão em packages/payments/src/stripe", () => {
  const files = collectSourceFiles(STRIPE_DIR);

  it("encontra pelo menos os arquivos esperados (sanity check do próprio teste)", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s não contém padrão de número de cartão (PAN)", (filePath) => {
    const content = readFileSync(filePath, "utf-8");
    const match = content.match(CARD_NUMBER_PATTERN);
    expect(match, `PAN-like sequence found in ${filePath}: "${match?.[0]}"`).toBeNull();
  });
});
