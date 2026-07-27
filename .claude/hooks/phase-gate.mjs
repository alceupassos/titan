#!/usr/bin/env node
// Stop — impede encerrar o turno com portão de fase pendente registrado em docs/fase-atual.md.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const fasePath = path.join(process.cwd(), "docs", "fase-atual.md");

if (!existsSync(fasePath)) {
  process.exit(0);
}

const content = readFileSync(fasePath, "utf8");

// Marcador explícito que o orquestrador escreve quando um portão está aberto e pendente:
// "PORTAO_PENDENTE: <descrição>" em uma linha própria.
const match = content.match(/^PORTAO_PENDENTE:\s*(.+)$/m);

if (match) {
  console.error(
    `Portão de fase pendente em docs/fase-atual.md: ${match[1]}\n` +
      "Rode os auditores (invariant-auditor, security-reviewer, convention-checker) antes de " +
      "encerrar, ou remova o marcador PORTAO_PENDENTE se o portão já foi fechado."
  );
  process.exit(2);
}

process.exit(0);
