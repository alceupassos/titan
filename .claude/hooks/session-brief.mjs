#!/usr/bin/env node
// SessionStart — imprime fase atual, faixas abertas e portões pendentes.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const fasePath = path.join(process.cwd(), "docs", "fase-atual.md");

if (!existsSync(fasePath)) {
  process.exit(0);
}

const content = readFileSync(fasePath, "utf8");
const fase = content.match(/\*\*Fase atual:\*\*\s*(.+)/)?.[1] ?? "não identificada";
const pendente = content.match(/^PORTAO_PENDENTE:\s*(.+)$/m)?.[1];

console.log(`[Titan Stay] Fase atual: ${fase}`);
if (pendente) {
  console.log(`[Titan Stay] Portão pendente: ${pendente}`);
}

process.exit(0);
