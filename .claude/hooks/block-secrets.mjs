#!/usr/bin/env node
// PreToolUse (Edit|Write) — nunca commitar .env com valor, .pfx/.p12, chave privada ou token.
// Registrado para Edit também (achado F-7 da auditoria de segurança de F0): editar um segredo
// para DENTRO de um arquivo já existente contornava este guarda quando só rodava em Write.
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
// `new_string` cobre o payload de Edit; `content` cobre Write. Faltava `new_string` antes
// (achado F-7) — Edit sempre passava despercebido, mesmo com o matcher certo registrado.
const content = input.content ?? input.new_string ?? "";

const isEnvFile = /(^|[\\/])\.env(\.|$)/.test(filePath) && !/\.env\.example$/.test(filePath);
const isCertFile = /\.(pfx|p12)$/.test(filePath);

if (isCertFile) {
  console.error(`Bloqueado: escrita de certificado (${filePath}). Nunca no repositório, nunca em imagem Docker.`);
  process.exit(2);
}

if (isEnvFile && /=\s*\S+/.test(content)) {
  console.error(
    `Bloqueado: ${filePath} parece conter valores reais. .env com segredo nunca vai para o repositório.\n` +
      "Use .env.example com placeholders, e segredo real via SOPS/age ou Infisical (ver infra/README.md)."
  );
  process.exit(2);
}

const secretPatterns = [
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
  /AKIA[0-9A-Z]{16}/, // AWS access key id shape
  /sk_live_[a-zA-Z0-9]+/, // Stripe live secret key shape
  /ghp_[a-zA-Z0-9]{20,}/, // GitHub token shape
];

if (secretPatterns.some((re) => re.test(content))) {
  console.error(`Bloqueado: padrão de segredo/chave privada detectado em ${filePath}.`);
  process.exit(2);
}

process.exit(0);
