-- Migration 0001 — corrige achados F-1/F-3 (FALHA A/B) da auditoria de segurança da Fase 0:
-- (1) 0000_init.sql não concedia privilégios a nenhum papel não-superusuário — a aplicação
--     conectava como `titan` (superusuário da imagem oficial do Postgres), e FORCE ROW LEVEL
--     SECURITY não vale para superusuário. RLS estava, na prática, inerte.
-- (2) `tenants` nunca recebeu RLS — qualquer sessão enumerava todos os tenants.
-- O papel `titan_app` é criado em infra/postgres/init/01-app-role.sh (bootstrap do container,
-- não aqui — CREATE ROLE com senha não pertence a uma migration versionada e commitada).
-- APLICADA NUNCA É ALTERADA — correções futuras entram em migration nova.

-- RLS em `tenants` (ausente em 0000_init.sql — FALHA B).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tenants ON tenants
  USING (id = current_setting('app.tenant_id', true)::uuid);

-- Privilégios mínimos para `titan_app` (não-superusuário, NOBYPASSRLS — só assim RLS se aplica).
GRANT CONNECT ON DATABASE titan_dev TO titan_app;
GRANT USAGE ON SCHEMA public TO titan_app;

GRANT SELECT, INSERT, UPDATE ON tenants TO titan_app;
GRANT SELECT, INSERT, UPDATE ON users TO titan_app;

-- audit_log é append-only por definição (FALHA A): SELECT e INSERT apenas. Nunca UPDATE/DELETE
-- concedido a `titan_app` — a garantia agora é do banco (REVOKE explícito), não de comentário.
GRANT SELECT, INSERT ON audit_log TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM titan_app, PUBLIC;

-- NENHUM default privilege global aqui de propósito (achado N1 da segunda auditoria — a versão
-- anterior deste arquivo, nunca commitada, tinha `ALTER DEFAULT PRIVILEGES ... GRANT ... UPDATE
-- ON TABLES`, que concederia UPDATE a `titan_app` em TODA tabela futura, incluindo tabelas ainda
-- não criadas que carregam I3/I7 — `ledger_entries`, `fiscal_document` etc. Um default aberto
-- nessas tabelas é exatamente o anti-padrão #20 antes mesmo de elas existirem, e nenhum hook
-- pega `CREATE TABLE` puro sem GRANT explícito). A regra correta: toda tabela nova declara seus
-- próprios grants explícitos na migration que a cria — exatamente como audit_log fez acima.
-- `migration-writer` (seção 5.11.3) segue essa regra em toda fase futura.

-- Nota de rollback: REVOKE tudo acima de titan_app; DROP POLICY tenant_isolation_tenants ON
-- tenants; ALTER TABLE tenants DISABLE ROW LEVEL SECURITY — só em desenvolvimento local.
