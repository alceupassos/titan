#!/usr/bin/env node
// PostToolUse (Edit) — roda vitest do pacote alterado e devolve a falha ao agente.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return null;
  }
}

function findPackageRoot(startDir) {
  let dir = startDir;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

const payload = readStdin();
const filePath = payload?.tool_input?.file_path;

if (!filePath || !/^(packages|apps)[\\/]/.test(path.relative(process.cwd(), filePath))) {
  process.exit(0);
}

const pkgRoot = findPackageRoot(path.dirname(filePath));
if (!pkgRoot) process.exit(0);

let pkgJson;
try {
  pkgJson = JSON.parse(readFileSync(path.join(pkgRoot, "package.json"), "utf8"));
} catch {
  process.exit(0);
}

if (!pkgJson.scripts?.test) {
  process.exit(0); // pacote ainda não tem script de teste (stub) — nada a rodar
}

try {
  execSync("pnpm run test -- --run", { cwd: pkgRoot, stdio: "pipe" });
  process.exit(0);
} catch (err) {
  console.error(
    `Testes falharam em ${pkgJson.name ?? pkgRoot} após a edição de ${filePath}:\n\n` +
      (err.stdout?.toString?.() ?? "") +
      (err.stderr?.toString?.() ?? "")
  );
  process.exit(2);
}
