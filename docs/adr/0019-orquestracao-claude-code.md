# ADR-0019 — Orquestração Claude Code

**Status:** Implementado na Fase 0 (2026-07-27) — 11 subagentes em `.claude/agents/`, 11 hooks em
`.claude/hooks/`, `settings.json` e `.mcp.json` gravados.

## Contexto
O projeto é construído no Claude Code, com Opus 5 como orquestrador único (tech lead), decidindo
o corte de fases, delegando a subagentes, integrando e respondendo pelo conjunto — sem atribuição
fixa de modelo por subagente imposta externamente.

## Decisão
- **Verificação inicial obrigatória** antes de criar qualquer configuração: confirmar na
  documentação vigente do Claude Code o formato atual de frontmatter de subagente
  (`.claude/agents/`), comandos (`.claude/commands/`), skills (`.claude/skills/*/SKILL.md`),
  hooks e eventos, `settings.json` e `.mcp.json`. Não presumir campos.
- **Política de modelo por critério de julgamento** (não tabela fixa): Opus para julgamento de
  consequência alta (domínio, migration em ledger/evidência, fiscal, pricing estatístico,
  auditoria de invariantes/segurança, corte de fase); Sonnet para especificação já clara e volume
  (adapters contra porta definida, UI a partir de tokens, CRUD, testes, documentação); Haiku para
  verificação determinística e volume alto (varredura de convenção, extração de fixtures,
  contagem/contraste). Ver `docs/decisoes-de-negocio.md`... *(tabela completa na seção 7 do plano
  aprovado da Rodada 0 — replicar em `.claude/agents/*.md` na Fase 0)*.
- **Plan mode obrigatório antes de cada fase**, sem exceção: plano numerado, arquivos a tocar,
  faixas identificadas, modelo escolhido por faixa com justificativa de uma linha; espera
  aprovação; só então executa.
- **Dois mecanismos de paralelismo:** subagentes (Task) para auditoria/pesquisa/faixa de
  diretório exclusivo; worktrees + instâncias paralelas para faixas de escrita longas e
  disjuntas (ex.: 4 adapters de canal, 4 adapters de gateway).
- **Hooks determinísticos** (`.claude/hooks/`) para as invariantes que puderem ser mecanizadas —
  ver `docs/invariantes.md` e a lista de **11 hooks** da seção 5.11.4 do prompt único (a seção
  5.11.3 do prompt único diz "nove subagentes é o catálogo" mas lista 11 — texto-fonte
  desatualizado; construímos os 11 com conteúdo completo).

## Justificativa
"Regra em prompt é pedido. Hook é bloqueio." Nenhum subagente, em nenhum modelo, contorna um hook
`PreToolUse` que retorna código de bloqueio.

## Consequências
- Escalonamento: subagente que falha duas vezes no mesmo problema é reescalado para modelo mais
  forte com o contexto do fracasso — nunca uma terceira tentativa igual.
- Rebaixamento: tarefa que Opus resolveu e virou padrão repetível é especificada e movida para
  Sonnet.
- Duas faixas nunca escrevem no mesmo diretório; achado de auditoria volta para a faixa de
  origem, nunca é corrigido na integração (anti-padrões #21 e #22).

## Verificação inicial (Fase 0)

Confirmado nesta fase: `.claude/agents/*.md` usa frontmatter `name`/`description`/`tools`
(string separada por vírgula)/`model` (`opus`|`sonnet`|`haiku`) — sem campos especulativos além
destes quatro. Hooks usam os eventos `PreToolUse`, `PostToolUse`, `SubagentStop`, `Stop`,
`SessionStart`, wired em `settings.json` via `matcher` + array `hooks: [{type:"command",
command:"..."}]`; exit code 2 bloqueia (stderr volta ao agente), exit 0 permite. `settings.json`
permissions usa `{deny, ask, allow}` com avaliação nessa ordem. `.mcp.json` usa
`mcpServers.<nome> = {type: "stdio"|"http"|"sse", ...}`. Os hooks foram implementados em
Node.js (`.mjs`, não `.sh` — mais robusto para parsing de JSON do stdin que shell puro) e
testados manualmente com payloads de exemplo antes de serem wireados (ver
`docs/build-log.md` e o portão de saída de Fase 0 em `docs/fase-atual.md`).
