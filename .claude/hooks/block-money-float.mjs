#!/usr/bin/env node
// PostToolUse (Edit|Write) — campo monetário nunca é `number`/float; centavos inteiros + Dinero.js.
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

if (!/\.(ts|tsx)$/.test(filePath)) {
  process.exit(0);
}

const moneyFieldNames =
  /(amount|price|total|fee|balance|payout|tax|deposit|revenue|cost|valor|preco|repasse|caucao)\w*/i;

const lines = content.split("\n");
const offenders = [];

lines.forEach((line, i) => {
  const isMoneyField = moneyFieldNames.test(line);
  const typedAsNumber = /:\s*number\b/.test(line);
  const floatArithmetic = /\/\s*100\b|\*\s*1\.\d|parseFloat\(/.test(line);
  if (isMoneyField && (typedAsNumber || floatArithmetic)) {
    offenders.push(`  linha ${i + 1}: ${line.trim()}`);
  }
});

if (offenders.length > 0) {
  console.error(
    `Possível campo monetário como number/float em ${filePath}:\n${offenders.join("\n")}\n` +
      "Dinheiro é inteiro em centavos + Dinero.js. `number` para valor monetário é erro (docs/anti-padroes.md #9)."
  );
  process.exit(2);
}

process.exit(0);
