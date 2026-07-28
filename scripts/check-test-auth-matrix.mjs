#!/usr/bin/env node
// `pnpm test:auth` deve FALHAR explicitamente até a matriz [persona × rota × ação] da seção 7.3
// existir de verdade (ADR-0008, achado F-5 da auditoria de segurança da Fase 0). Antes, `turbo
// run test:auth` sem nenhum pacote definindo esse script saía com "No tasks were executed" e
// exit code 0 — um portão que nunca pode falhar é o anti-padrão #20 (docs/anti-padroes.md),
// aplicado ao próprio processo de portão.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");

function packageDirs() {
  const dirs = [];
  for (const group of ["packages", "apps"]) {
    const groupPath = path.join(root, group);
    if (!existsSync(groupPath)) continue;
    for (const name of readdirSync(groupPath)) {
      const pkgJsonPath = path.join(groupPath, name, "package.json");
      if (existsSync(pkgJsonPath)) dirs.push(pkgJsonPath);
    }
  }
  return dirs;
}

const packagesWithMatrix = packageDirs().filter((pkgJsonPath) => {
  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
    return Boolean(pkg.scripts?.["test:auth"]);
  } catch {
    return false;
  }
});

if (packagesWithMatrix.length === 0) {
  console.error(
    "FALHA: nenhum pacote define test:auth ainda — a matriz [persona × rota × ação] da seção " +
      "7.3 (ADR-0008) ainda não existe. Este comando falha DE PROPÓSITO enquanto isso for " +
      "verdade, em vez de sair 0 com 'nenhuma tarefa executada' — um portão que não pode " +
      "falhar não é portão (docs/anti-padroes.md #20).\n\n" +
      "Quando a primeira rota/Server Action real nascer, o pacote correspondente ganha um " +
      "script test:auth de verdade, e este arquivo passa a delegar para `turbo run test:auth`.",
  );
  process.exit(1);
}

execSync("pnpm turbo run test:auth", { stdio: "inherit", cwd: root });
