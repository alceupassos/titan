#!/usr/bin/env node
// PostToolUse (Edit|Write) — SET app.* sem LOCAL (ou set_config(...,false), equivalente sob
// pooling) vaza contexto de tenant sob PgBouncer (ADR-0007).
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

// Teste/fixture que PROVA o vazamento de propósito (controle negativo) contém o anti-padrão
// intencionalmente — mesma convenção de exceção usada em block-hardcoded-tax.mjs.
const isTestOrFixture = /(test|spec|fixture)/i.test(filePath);
if (isTestOrFixture) {
  process.exit(0);
}

// Casa "SET app.xxx" que NÃO seja imediatamente seguido de LOCAL.
const badSet = /\bSET\s+(?!LOCAL\b)app\.\w+/i;

// Casa set_config('app.xxx', ..., false) — falso no terceiro argumento é o equivalente
// funcional de SET sem LOCAL: persiste na sessão inteira, não só na transação (achado F-6 da
// auditoria de segurança da Fase 0 — o padrão real usado no client.ts é set_config(...,true),
// nunca detectável pela regex antiga que só olhava para a sintaxe SET literal).
const badSetConfig = /set_config\s*\(\s*['"`]app\.\w+['"`]\s*,[^)]*?,\s*false\s*\)/i;

if (badSet.test(content) || badSetConfig.test(content)) {
  console.error(
    `Bloqueado: contexto de tenant setado sem escopo de transação em ${filePath}.\n` +
      "Sob PgBouncer em modo transação, isso persiste na conexão física e vaza contexto de " +
      "tenant entre requisições — é vazamento de dados, não bug de performance. " +
      "Use sempre 'SELECT set_config(...,  true)' (equivalente a SET LOCAL) dentro de uma " +
      "transação explícita — ver packages/db/src/client.ts."
  );
  process.exit(2);
}

process.exit(0);
