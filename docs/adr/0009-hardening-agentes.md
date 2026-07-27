# ADR-0009 — Hardening das instâncias de agente

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
Agentes de IA (Concierge, Sales, Revenue, Operations, Financial, Fiscal, Distribution, Risk,
Reputation, Supervisor) tocam sistemas com consequência financeira e fiscal real. Prompt injection
é um problema não resolvido pela indústria, e mensagens de hóspede são input hostil por definição.

## Decisão
Adotar os 12 guardrails da seção 9.12.5 como código, não como instrução de prompt:
1. Instância que ingere conteúdo não confiável nunca tem ferramenta de escrita.
2. Uma instância por papel, container separado, credencial própria.
3. Sem shell/exec em instância com credencial Titan.
4. Allowlist de números/IDs de staff para canais de mensageria; nenhum canal de hóspede aponta
   para essas instâncias.
5. Versão travada + SLA de patch 72h para CVE de severidade alta.
6. Skill autogerada desabilitada para qualquer coisa que toque a Titan.
7. Orçamento por instância (tokens, CPU/memória, rate limit de provedor).
8. Memória tratada como armazenamento não confiável e efêmero; Postgres é a fonte de verdade.
9. Rede isolada, egress allowlist (só provedor LLM + MCP + mensageria).
10. Nada irreversível sem confirmação (cancelar reserva, revogar acesso, publicar em canal).
11. Fiscal/dinheiro: agente enfileira, analisa, propõe — nunca emite/cancela nota ou executa PIX.
12. Transparência: identifica-se como assistente, respeita janela de 24h do WhatsApp.

## Justificativa
Uma regra em prompt é um pedido; um guardrail em código/infra é um bloqueio que nenhum modelo,
em nenhuma versão, contorna.

## Consequências
- Kill switch = revogar o token MCP da instância.
- Toda chamada de agente é auditada (`actor_type='agent'`), visível no Automation Console.
