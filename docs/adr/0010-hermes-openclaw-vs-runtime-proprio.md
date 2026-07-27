# ADR-0010 — Por que Concierge/Sales/Risk não rodam em Hermes/OpenClaw

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
OpenClaw (ex-Clawdbot) e Hermes Agent (Nous Research) são frameworks de assistente pessoal
local-first e messaging-first, excelentes para o uso a que se propõem, mas com modelo de
tenancy/segurança incompatível com o plano hóspede/dinheiro:
- Ambos são single-tenant por design (Hermes issue #34352: um agente = um tenant, memória
  global, sessões sem escopo → risco de vazamento de PII entre sessões para um Concierge
  atendendo centenas de hóspedes).
- OpenClaw: sem isolamento de permissão, sessões locais em texto plano; "uma VM por usuário"
  quebra na faixa de 30–50 usuários; docs declaram uso multi-tenant adversarial como fora de
  escopo.
- CVE-2026-25253 (CVSS 8.8, injeção de comando) no OpenClaw, corrigido a partir da 1.2.3.
- Hermes autogera skills a partir de padrões repetidos — ótimo para produtividade pessoal,
  inaceitável para um sistema que emite nota e executa PIX.

## Decisão
Arquitetura de dois planos:
- **Plano Operador** (Hermes Agent, com OpenClaw restrito a monitoramento read-only): usado
  **apenas** por staff Titan autenticado via Telegram/Slack/WhatsApp, nunca ingere mensagem de
  hóspede, conteúdo de OTA ou review.
- **Plano Plataforma** (runtime próprio): Concierge, Sales, Risk — multi-tenant real, ABAC por
  ator, isolamento por reserva, prompts versionados, evals em CI.
- Único caminho entre os dois: MCP (`apps/mcp`), com tokens escopados e teto de valor.

## Justificativa
Preserva as invariantes I1–I10 porque nenhum plano de agente consegue violar constraint de banco
ou contornar autorização se só fala com o sistema por ferramentas permissionadas.

## Consequências
- Começar só com Hermes no plano operador — dois frameworks dobrariam a superfície de ataque e o
  esforço de patch pelo mesmo ganho.
- Monitorar continuidade do Nous Research (Hermes) como risco de fornecedor.
