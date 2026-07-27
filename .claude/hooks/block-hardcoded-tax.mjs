#!/usr/bin/env node
// PreToolUse (Edit|Write) — alíquota/código de serviço/retenção/prazo de canal: tabela
// versionada, nunca literal de código (fora de seed/teste).
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

const inFiscalOrVendors = /packages[\\/](fiscal|vendors)[\\/]/.test(filePath);
const isSeedOrTest = /(seed|test|spec|fixture)/i.test(filePath);

if (!inFiscalOrVendors || isSeedOrTest) {
  process.exit(0);
}

// Heurística: constante numérica atribuída a algo com nome de aliquota/retencao/prazo, fora de
// uma tabela explicitamente marcada como versionada (tax_rules / withholding_rules).
const hardcodedPattern =
  /\b(aliquota|iss|issRate|withholdingRate|retencao|prazoCanal|channelDeadline)\s*[:=]\s*0?\.\d+/i;
const declaresVersionedTable = /(tax_rules|withholding_rules)/i.test(content);

if (hardcodedPattern.test(content) && !declaresVersionedTable) {
  console.error(
    `Bloqueado: literal numérico de alíquota/retenção/prazo de canal fora de tabela versionada em ${filePath}.\n` +
      "Use tax_rules / withholding_rules versionada por vigência — nunca constante de código."
  );
  process.exit(2);
}

process.exit(0);
