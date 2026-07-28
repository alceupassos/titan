#!/usr/bin/env node
// Gerador de imagem ad hoc (login/marketing, placeholders de evidência) — NÃO é parte do build
// do produto, é uma ferramenta de dev para ilustrar o cockpit quando necessário. Lê a chave de
// API só de `process.env`, nunca de um arquivo lido por este agente — rode via
// `! node scripts/generate-image.mjs ...` (variáveis de ambiente já carregadas no seu shell) ou
// com `--env-file=.env` (suportado nativamente pelo Node ≥20.6, ver uso abaixo).
//
// Uso:
//   node --env-file=.env scripts/generate-image.mjs --provider=openai --prompt="..." --out=caminho.png
//
// Provedores suportados: openai | gemini | grok
//   openai -> OPENAI_API_KEY   (API Images, modelo gpt-image-1)
//   gemini -> GEMINI_API_KEY   (Imagen via generativelanguage.googleapis.com)
//   grok   -> XAI_API_KEY      (API de imagem da xAI, formato compatível com OpenAI)
//
// Nomes de endpoint/modelo mudam com frequência nestes provedores — se a chamada falhar com erro
// 404/400 de "modelo não encontrado", o corpo do erro (impresso abaixo) normalmente diz qual
// nome atual usar; ajuste a constante do provedor correspondente.

import { writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = { size: "1024x1024" };
  for (const raw of argv) {
    const match = /^--([a-zA-Z]+)=(.*)$/.exec(raw);
    if (!match) continue;
    args[match[1]] = match[2];
  }
  if (!args.provider || !args.prompt || !args.out) {
    throw new Error(
      "Uso: node scripts/generate-image.mjs --provider=openai|gemini|grok --prompt=\"...\" --out=arquivo.png [--size=1024x1024]",
    );
  }
  return args;
}

async function generateOpenAI(prompt, size) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY ausente em process.env.");
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-image-1", prompt, size, n: 1 }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`OpenAI Images API falhou (status ${res.status}): ${JSON.stringify(body)}`);
  }
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Resposta da OpenAI sem b64_json: ${JSON.stringify(body)}`);
  return Buffer.from(b64, "base64");
}

async function generateGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente em process.env.");
  // Imagen via Gemini API — verifique o nome do modelo atual na doc do Google se isto retornar 404.
  const model = "imagen-3.0-generate-002";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1 } }),
    },
  );
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`Gemini Imagen API falhou (status ${res.status}): ${JSON.stringify(body)}`);
  }
  const b64 = body.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error(`Resposta do Gemini sem bytesBase64Encoded: ${JSON.stringify(body)}`);
  return Buffer.from(b64, "base64");
}

async function generateGrok(prompt) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY ausente em process.env.");
  // Formato compatível com a API de imagens da OpenAI — verifique o nome do modelo atual na doc
  // da xAI se isto retornar 404.
  const res = await fetch("https://api.x.ai/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "grok-2-image", prompt, n: 1, response_format: "b64_json" }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(`xAI Images API falhou (status ${res.status}): ${JSON.stringify(body)}`);
  }
  const b64 = body.data?.[0]?.b64_json;
  if (!b64) throw new Error(`Resposta da xAI sem b64_json: ${JSON.stringify(body)}`);
  return Buffer.from(b64, "base64");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const generators = { openai: generateOpenAI, gemini: generateGemini, grok: generateGrok };
  const generate = generators[args.provider];
  if (!generate) {
    throw new Error(`Provedor desconhecido: "${args.provider}". Use openai, gemini ou grok.`);
  }

  const bytes = await generate(args.prompt, args.size);
  const outPath = path.resolve(args.out);
  await writeFile(outPath, bytes);
  console.log(`Imagem salva em: ${outPath} (${bytes.length} bytes)`);
}

main().catch((err) => {
  console.error("Falha ao gerar imagem:", err.message ?? err);
  process.exitCode = 1;
});
