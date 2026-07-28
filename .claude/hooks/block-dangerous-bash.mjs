#!/usr/bin/env node
// PreToolUse (Bash) — cobre o que os `deny` de settings.json com wildcard à ESQUERDA
// (`Bash(*DROP TABLE*)`, `Bash(*psql*prod*)`) prometiam mas não bloqueiam de fato: a auditoria
// de segurança da Fase 0 provou por probe que o matcher de permissão de Bash não casa padrão
// iniciado em `*` (achado F-8). Esses três `deny` foram removidos de settings.json — proteção
// que parece existir mas não bloqueia é pior que nenhuma (mesmo espírito de "ausência de botão
// não é segurança", aplicado a hook/permissão). Este hook cobre a mesma intenção com regex real,
// já provado funcionar nos outros hooks .mjs.
import { readFileSync } from "node:fs";

function readStdin() {
  try {
    return { ok: true, payload: JSON.parse(readFileSync(0, "utf8")) };
  } catch {
    return { ok: false, payload: null };
  }
}

const stdin = readStdin();
if (!stdin.ok) {
  process.exit(0); // convenção de estilo, não invariante não negociável — falha aberto
}

const command = stdin.payload?.tool_input?.command ?? "";

const rules = [
  { pattern: /\bDROP\s+TABLE\b/i, message: "DROP TABLE via Bash — migration aplicada nunca se altera; use uma migration nova." },
  { pattern: /\bTRUNCATE\b/i, message: "TRUNCATE via Bash — mesma regra do DROP TABLE, corrija por migration nova." },
  // Sem \b depois de "prod": "prod_db", "prod-cluster" etc. não têm fronteira de palavra entre
  // "prod" e o separador (\w inclui `_`), então \bprod\b não casaria "prod_db" — bug encontrado
  // e corrigido durante a prova deste próprio hook.
  { pattern: /\bpsql\b.*\bprod/i, message: "psql apontando para algo com 'prod' no nome — conexão direta a produção nunca via Bash do agente." },
];

for (const rule of rules) {
  if (rule.pattern.test(command)) {
    console.error(`Bloqueado: ${rule.message}\nComando: ${command}`);
    process.exit(2);
  }
}

process.exit(0);
