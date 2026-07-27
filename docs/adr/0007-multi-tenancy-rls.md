# ADR-0007 — Multi-tenancy e RLS sob connection pooling

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
PgBouncer em modo transação é obrigatório (Next.js multi-processo + workers esgotam conexões
rapidamente sem ele). Sob pooling de transação, `SET` simples persiste na conexão física e vaza
contexto de tenant entre requisições de tenants diferentes.

## Decisão
RLS ativa por tenant em toda tabela, com `SET LOCAL app.tenant_id` (e `app.actor_id`,
`app.owner_scope`) **sempre dentro de uma transação explícita**. `SET` sem `LOCAL` é proibido e
detectado por hook (`block-set-without-local.sh`) e por `convention-checker`.

## Justificativa
Vazamento de contexto de tenant sob pooling é vazamento de dados entre proprietários, não bug de
performance — a spec chama isso de "armadilha crítica".

## Consequências
- Teste Testcontainers obrigatório provando isolamento sob PgBouncer real (não mock) antes do
  portão da Fase 0.
- Toda tabela nasce com `tenant_id` e política RLS desde a primeira migration.
- Nenhuma query de aplicação depende de `WHERE tenant_id = ...` manual — a garantia é do banco.
