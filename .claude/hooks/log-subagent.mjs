#!/usr/bin/env node
// SubagentStop — anexa modelo usado, faixa (subagente) e resultado a docs/build-log.md.
import { readFileSync, appendFileSync, existsSync, writeFileSync } from "node:fs";
import path from "node:path";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const payload = readStdin() ?? {};
const logPath = path.join(process.cwd(), "docs", "build-log.md");

if (!existsSync(logPath)) {
  writeFileSync(logPath, "# Log de build — subagentes\n\n| Quando | Subagente | Modelo | Resultado |\n|---|---|---|---|\n");
}

const when = new Date().toISOString();
const agentName = payload.agent_type ?? payload.subagent_type ?? "desconhecido";
const model = payload.model ?? "desconhecido";
const outcome = payload.status ?? payload.result ?? "concluído";

appendFileSync(logPath, `| ${when} | ${agentName} | ${model} | ${outcome} |\n`);
process.exit(0);
