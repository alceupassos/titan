# ADR-0017 — MCPs instalados, escopos e separação dev/prod

**Status:** Proposto (Rodada 0) — aguardando "ok"

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
