#!/usr/bin/env node
// PostToolUse (Edit|Write) — SET app.* sem LOCAL vaza contexto de tenant sob PgBouncer (ADR-0007).
import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const payload = readStdin();
const input = payload?.tool_input ?? {};
const filePath = input.file_path ?? "";
const content = input.content ?? input.new_string ?? "";

if (!/\.(ts|tsx|sql)$/.test(filePath)) {
  process.exit(0);
}

// Casa "SET app.xxx" que NÃO seja imediatamente seguido de LOCAL.
const badSet = /\bSET\s+(?!LOCAL\b)app\.\w+/i;

if (badSet.test(content)) {
  console.error(
    `Bloqueado: 'SET app.*' sem 'LOCAL' em ${filePath}.\n` +
      "Sob PgBouncer em modo transação, SET simples persiste na conexão física e vaza contexto " +
      "de tenant entre requisições — é vazamento de dados, não bug de performance. " +
      "Use sempre 'SET LOCAL app.tenant_id' dentro de uma transação explícita."
  );
  process.exit(2);
}

process.exit(0);
