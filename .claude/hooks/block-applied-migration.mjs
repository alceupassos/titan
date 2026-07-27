#!/usr/bin/env node
// PreToolUse (Edit) — bloqueia edição de migration já aplicada (I: migration nunca se altera).
// "Aplicada" = já commitada no git (o HEAD tem uma versão desse arquivo).
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

const payload = readStdin();
const filePath = payload?.tool_input?.file_path;

if (!filePath || !/packages[\\/]db[\\/]migrations[\\/].*\.sql$/.test(filePath)) {
  process.exit(0); // não é migration — nada a checar
}

try {
  const relative = filePath.replace(process.cwd() + path.sep, "");
  execSync(`git show HEAD:"${relative.replace(/\\/g, "/")}"`, { stdio: "ignore" });
  // se chegou aqui, o arquivo já existe commitado no HEAD — é aplicada
  console.error(
    `Migration já aplicada (existe no HEAD do git): ${filePath}\n` +
      `Migration aplicada NUNCA é alterada. Crie uma nova migration para corrigir.`
  );
  process.exit(2);
} catch {
  // não existe no HEAD ainda (é nova, não commitada) — permite edição
  process.exit(0);
}
