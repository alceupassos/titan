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
      "ou reporte isto como um bug do harness."
  );
  process.exit(2);
}

const payload = stdin.payload;
const toolName = payload?.tool_name ?? "";
const input = payload?.tool_input ?? {};
const filePath = input.file_path ?? "";

// .claude/** são scripts de controle do próprio harness (hooks, subagentes), não código de
// produto onde I10 se aplica. Sem esta isenção o hook se autobloqueia: seu próprio nome de
// arquivo contém "evidence", e seus comentários precisam descrever os padrões que ele detecta
// para serem legíveis — o que naturalmente contém os mesmos termos que ele procura.
// Achado N4 da segunda auditoria: a versão anterior só casava caminho RELATIVO
// (^\.claude[\\/]), mas o harness sempre envia file_path ABSOLUTO — a isenção nunca disparava
// de verdade fora dos meus próprios testes com caminho relativo. Agora casa ".claude" como
// segmento de caminho em qualquer posição, não só no início da string.
if (/(^|[\\/])\.claude[\\/]/.test(filePath)) {
  process.exit(0);
}

const content = input.content ?? input.new_string ?? "";
const command = input.command ?? "";
const haystack = `${content}\n${command}`;

// Padrões AUTOSSUFICIENTES: já mencionam evidência dentro da própria regra, então casam
// independente do caminho do arquivo. Corrige achado FALHA-E da auditoria de invariantes de F0:
// a versão anterior exigia o termo no CAMINHO como pré-condição, então um arquivo em
// packages/housekeeping fazendo a chamada de exclusão do Drizzle na tabela de evidência passava
// livre — o caminho não continha o termo, só o conteúdo continha.
//
// A terceira e a sétima entrada abaixo são construídas via RegExp(concatenação de string) em vez
// de regex literal: escritas como regex literal, elas casariam contra o próprio texto-fonte
// deste arquivo (o "." e "*" do próprio padrão também servem de match para os caracteres "." e
// "*" que aparecem na definição do padrão), criando um autobloqueio permanente — encontrado e
// corrigido durante a prova deste hook (ver docs/hook-proofs.md).
const selfQualifyingPatterns = [
  /DELETE\s+FROM\s+evidence/i,
  /DROP\s+TABLE\s+evidence/i,
  new RegExp("evid" + "ence_log" + ".*" + "DEL" + "ETE", "i"),
  /\.deleteEvidence\s*\(/i,
  /export\s+(async\s+)?function\s+delete\w*Evidence/i,
  /router\.(delete|post)\s*\(\s*["'`][^"'`]*evidence[^"'`]*delete/i,
  new RegExp("\\." + "delete" + "\\s*\\(\\s*" + "evidence" + "\\w*", "i"),
];

if (selfQualifyingPatterns.some((re) => re.test(haystack))) {
  console.error(
    "Bloqueado: código de exclusão de evidência detectado (independente do caminho do arquivo).\n" +
      "I10 — evidência nunca é excluída por nenhum papel. Marque como descartada com motivo, nunca exclua."
  );
  process.exit(2);
}

// Padrão GENÉRICO: handler App Router (Next.js) do método de exclusão HTTP não menciona
// evidência por si só — é o handler de QUALQUER recurso. Só é sinal de risco combinado com o
// caminho apontando para evidência (evita bloquear o mesmo handler de reserva, usuário, etc.).
const genericAppRouterDelete = /export\s+(async\s+)?function\s+DELETE\s*\(/;
const pathMentionsEvidence = /evidence/i.test(filePath);

if (genericAppRouterDelete.test(haystack) && pathMentionsEvidence) {
  console.error(
    "Bloqueado: handler do método de exclusão HTTP (App Router) num caminho de evidência.\n" +
      "I10 — evidência nunca é excluída por nenhum papel. Marque como descartada com motivo, nunca exclua."
  );
  process.exit(2);
}

if (toolName === "Bash" && /\brm\b.*evidence/i.test(command)) {
  console.error("Bloqueado: comando de remoção atingindo caminho de evidência. I10 proíbe exclusão.");
  process.exit(2);
}

process.exit(0);
