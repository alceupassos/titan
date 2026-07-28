# ADR-0017 — MCPs instalados, escopos e separação dev/prod

**Status:** Ajustado na Fase 0 (2026-07-27) — servidor PostgreSQL de terceiro removido de
`.mcp.json` (ver Consequências).

## Contexto
O ecossistema MCP muda rápido; a spec exige verificar nome, origem e permissão antes de instalar
qualquer servidor, e nunca apontar MCP de terceiro para o banco de produção.

## Decisão
Lista de MCPs de terceiro e escopo:

| Servidor | Para quê | Cuidado |
|---|---|---|
| PostgreSQL | Schema, `EXPLAIN`, validação de migration | **Banco local ou cópia — nunca produção** |
| Playwright | E2E dirigido, inspeção visual | — |
| GitHub | Branches, PRs, issues | Token de escopo mínimo |
| Sentry | Puxar erro real | Somente leitura |
| Redis | Inspecionar filas BullMQ | — |
| Cloudflare | Cache, DNS, túnel | Escopo mínimo |
| Stripe | Objetos de sandbox | Chave de **teste** apenas |
| Documentação de bibliotecas | Assinaturas atualizadas | Evita API alucinada |

MCP próprio (`apps/mcp`) tem **duas instâncias que nunca se confundem**: `titan-mcp-dev` (banco
local com dados sintéticos, consumido pelos subagentes de desenvolvimento) e `titan-mcp-prod`
(catálogo restrito da seção 9.12.4, consumido apenas pelo Hermes no plano operador, jamais por
agente de código).

## Justificativa
Ferramenta bloqueada (`issue_nfse`, `cancel_nfse`, `execute_payout`, `process_refund`,
`charge_security_deposit`, `change_user_role`, `export_pii_bulk`, `cancel_reservation`,
`delete_evidence`, `raw_sql`) não pode existir como ferramenta para nenhum agente externo, em
nenhuma instância.

## Consequências
- `.mcp.json` versionado no repositório como fonte de verdade dos servidores autorizados.
- Qualquer novo MCP passa por esta mesma checagem antes de entrar no `.mcp.json`.

## Ajuste na Fase 0 (achado F-4 da auditoria de segurança)

O servidor `@modelcontextprotocol/server-postgres`, incluído inicialmente como "postgres-dev",
foi **removido** de `.mcp.json`. Esse pacote expõe uma ferramenta de query SQL irrestrita — é,
na prática, `raw_sql` — e a linha de `raw_sql` na tabela de ferramentas bloqueadas acima proíbe
isso para qualquer agente, em qualquer instância, sem exceção para "é só dev". Não existe forma
de "restringir" esse pacote a schema/EXPLAIN apenas; a ferramenta que ele expõe é SQL arbitrário
por definição.

Enquanto não houver um MCP de introspecção de schema genuinamente somente-leitura e escopado
(schema + `EXPLAIN` apenas, sem `query` de SQL livre), introspecção de banco em desenvolvimento
acontece via `psql`/`drizzle-kit studio` rodados diretamente pelo desenvolvedor — nunca como
ferramenta MCP permanentemente disponível a qualquer subagente.
