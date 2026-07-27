#!/usr/bin/env node
// PreToolUse (Edit|Write|Bash) — I10: evidência nunca é excluída, nenhum papel, nenhuma rota.
import { readFileSync } from "node:fs";

function readStdin() {
  const raw = readFileSync(0, "utf8");
  try {
    return { ok: true, payload: JSON.parse(raw), raw };
  } catch {
    return { ok: false, payload: null, raw };
  }
}

const stdin = readStdin();
if (!stdin.ok) {
  // I10 é não negociável — payload ilegível é tratado como suspeito, não como "sem opinião".
  // Falha FECHADA (bloqueia) em vez de aberta, ao contrário dos hooks de convenção/estilo.
  console.error(
    "Bloqueado: payload do hook não pôde ser interpretado como JSON. " +
      "block-evidence-deletion.mjs falha fechado (I10 é não negociável) — corrija o payload " +
      "ou reporte isto como um bug do harness.",
  );
  process.exit(2);
}

const payload = stdin.payload;
const toolName = payload?.tool_name ?? "";
const input = payload?.tool_input ?? {};

const filePath = input.file_path ?? "";
const content = input.content ?? input.new_string ?? "";
const command = input.command ?? "";

const touchesEvidencePackage = /packages[\\/]evidence[\\/]/.test(filePath);

const deletionPatterns = [
  /DELETE\s+FROM\s+evidence/i,
  /DROP\s+TABLE\s+evidence/i,
  /evidence_log.*DELETE/i,
  /\.deleteEvidence\s*\(/i,
  /export\s+(async\s+)?function\s+delete\w*Evidence/i,
  /router\.(delete|post)\s*\(\s*["'`][^"'`]*evidence[^"'`]*delete/i,
];

const haystack = `${content}\n${command}`;

if (touchesEvidencePackage && deletionPatterns.some((re) => re.test(haystack))) {
  console.error(
    "Bloqueado: rota/código de exclusão de evidência detectado em packages/evidence.\n" +
      "I10 — evidência nunca é excluída por nenhum papel. Marque como descartada com motivo, nunca DELETE."
  );
  process.exit(2);
}

if (toolName === "Bash" && /\brm\b.*evidence/i.test(command)) {
  console.error("Bloqueado: comando `rm` atingindo caminho de evidência. I10 proíbe exclusão.");
  process.exit(2);
}

process.exit(0);
