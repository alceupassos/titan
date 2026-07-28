#!/usr/bin/env node
// PreToolUse (Edit|Write|Bash) — I3: lançamento financeiro é imutável; correção por estorno.
// Registrado para Bash também (achado FALHA-G da auditoria de invariantes de F0): SQL disparado
// via psql/heredoc contornava este guarda inteiro, porque só olhava content/new_string, nunca o
// campo command do payload de Bash.
import { readFileSync } from "node:fs";

function readStdin() {
  const raw = readFileSync(0, "utf8");
  try {
    return { ok: true, payload: JSON.parse(raw) };
  } catch {
    return { ok: false, payload: null };
  }
}

const stdin = readStdin();
if (!stdin.ok) {
  // I3 é não negociável — mesma lógica de falha fechada do block-evidence-deletion.mjs.
  console.error(
    "Bloqueado: payload do hook não pôde ser interpretado como JSON. " +
      "block-ledger-mutation.mjs falha fechado (I3 é não negociável)."
  );
  process.exit(2);
}

const payload = stdin.payload;
const input = payload?.tool_input ?? {};
const filePath = input.file_path ?? "";

// .claude/** (scripts do harness) e arquivos .md (documentação em prosa) são isentos: o
// primeiro porque este hook precisa poder descrever seus próprios padrões sem se autobloquear
// quando editado; o segundo porque prosa que explica a regra não é o mesmo risco que código de
// produto executando a mutação proibida (encontrado ao escrever docs/hook-proofs.md). Achado N4
// da segunda auditoria: a isenção de .claude/ só casava caminho relativo; o harness sempre envia
// caminho absoluto, então nunca disparava de verdade. Agora casa ".claude" como segmento de
// caminho em qualquer posição.
if (/(^|[\\/])\.claude[\\/]/.test(filePath) || /\.md$/i.test(filePath)) {
  process.exit(0);
}

const content = input.content ?? input.new_string ?? input.command ?? "";

const mutationPatterns = [
  /UPDATE\s+ledger_entr(y|ies)/i,
  /DELETE\s+FROM\s+ledger_entr(y|ies)/i,
  /GRANT\s+(UPDATE|DELETE)\s+ON\s+ledger_entr(y|ies)/i,
];

const removesReversalId = /reversal_of_id/.test(content) === false && /ledger_entr(y|ies)/i.test(content) && /DROP\s+COLUMN/i.test(content) && /reversal/i.test(content);

if (mutationPatterns.some((re) => re.test(content)) || removesReversalId) {
  console.error(
    "Bloqueado: mutação em ledger_entry (o método update/delete de banco) ou remoção de reversal_of_id.\n" +
      "I3 — lançamento financeiro é imutável (append-only). Corrija com um lançamento de estorno."
  );
  process.exit(2);
}

process.exit(0);
