// I4-adjacente aplicado a PII fiscal (não PAN de cartão — esse é o pacote packages/payments):
// nenhum CPF/CNPJ de hóspede, nome ou payload fiscal completo deveria ir para log em texto
// claro. Mesmo espírito de `packages/payments/src/asaas/no-pan.test.ts`, mas aqui a varredura é
// sobre uso de `console.log`/`console.error`/`console.warn` com o payload completo em vez de um
// padrão de dígitos: o risco aqui não é vazar número de cartão (fora de escopo deste pacote), é
// vazar CPF/CNPJ/nome do tomador do serviço em log de aplicação.
import { readdirSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const FOCUS_NFE_DIR = fileURLToPath(new URL(".", import.meta.url));

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
      continue;
    }
    if (extname(entry.name) !== ".ts" || entry.name.endsWith(".test.ts")) {
      continue;
    }
    files.push(fullPath);
  }
  return files;
}

describe("I4-adjacente (PII fiscal) — nenhum console.log/error/warn com payload completo no adapter Focus NFe", () => {
  it("varre todo .ts de packages/fiscal/src/focus-nfe (exceto testes) em busca de console.* logando payload/input/response inteiro", () => {
    const files = collectSourceFiles(FOCUS_NFE_DIR);
    expect(files.length).toBeGreaterThan(0);

    // Qualquer console.log/error/warn/info é suspeito neste diretório — o adapter não deveria
    // logar nada por conta própria (payload de entrada carrega takerDocument/issuerName; payload
    // de saída do provedor pode ecoar os mesmos dados). Regra simples e propositalmente ampla:
    // falso positivo custa uma linha de log genuinamente inofensiva revisada à mão; falso
    // negativo custa PII em log de produção.
    const consolePattern = /console\.(log|error|warn|info)\s*\(/;

    const offenders: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (consolePattern.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders, `Uso de console.* encontrado no adapter Focus NFe (risco de PII em log):\n${offenders.join("\n")}`).toEqual([]);
  });

  it("nenhum campo de PII (takerDocument/issuerName) aparece hardcoded fora dos arquivos de fixture", () => {
    // Documento (CPF/CNPJ) fabricado usado nos testes/fixtures nunca deveria aparecer no adapter
    // de produção (adapter.ts) fora de comentário/TODO — é só o formato do CAMPO que o adapter
    // manipula, nunca um valor fixo de hóspede real.
    const adapterPath = join(FOCUS_NFE_DIR, "adapter.ts");
    const content = readFileSync(adapterPath, "utf8");
    // O CPF fabricado usado em fixtures.ts (11144477735) não deve vazar para adapter.ts.
    expect(content).not.toContain("11144477735");
  });
});
