#!/usr/bin/env node
// PreToolUse (Edit|Write) — I3: lançamento financeiro é imutável; correção por estorno.
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
      "block-ledger-mutation.mjs falha fechado (I3 é não negociável).",
  );
  process.exit(2);
}

const payload = stdin.payload;
const input = payload?.tool_input ?? {};
const content = input.content ?? input.new_string ?? "";

const mutationPatterns = [
  /UPDATE\s+ledger_entr(y|ies)/i,
  /DELETE\s+FROM\s+ledger_entr(y|ies)/i,
  /GRANT\s+(UPDATE|DELETE)\s+ON\s+ledger_entr(y|ies)/i,
];

const removesReversalId = /reversal_of_id/.test(content) === false && /ledger_entr(y|ies)/i.test(content) && /DROP\s+COLUMN/i.test(content) && /reversal/i.test(content);

if (mutationPatterns.some((re) => re.test(content)) || removesReversalId) {
  console.error(
    "Bloqueado: mutação direta em ledger_entry (UPDATE/DELETE) ou remoção de reversal_of_id.\n" +
      "I3 — lançamento financeiro é imutável (append-only). Corrija com um lançamento de estorno."
  );
  process.exit(2);
}

process.exit(0);
