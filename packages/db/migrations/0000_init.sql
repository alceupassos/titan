-- Migration 0000 — fundação: tenants, users (mínima, ver Passo 5/Better Auth), audit_log, RLS.
-- APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md) — correções entram em migration nova.
-- Extensões (btree_gist, postgis, vector, pgcrypto, pg_trgm) já são habilitadas por
-- infra/postgres/init/00-extensions.sql no bootstrap do container; repetido aqui via
-- IF NOT EXISTS para o caso de rodar esta migration num banco que não passou por esse bootstrap.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  actor_type text NOT NULL CHECK (actor_type IN ('user', 'agent', 'system')),
  actor_id text NOT NULL,
  action text NOT NULL,
  diff jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS — I: "nenhuma query de aplicação sem tenant no WHERE, garantido por RLS, não por
-- disciplina" (docs/adr/0007-multi-tenancy-rls.md). FORCE ROW LEVEL SECURITY garante que a
-- policy vale mesmo para o dono da tabela — só um superusuário/BYPASSRLS escapa disso, e a
-- aplicação nunca deve rodar como tal.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_users ON users
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_audit_log ON audit_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Nota de rollback: DROP POLICY tenant_isolation_users ON users; DROP POLICY
-- tenant_isolation_audit_log ON audit_log; DROP TABLE audit_log; DROP TABLE users;
-- DROP TABLE tenants; — só use isto em ambiente de desenvolvimento local, nunca em produção
-- (migration aplicada em produção nunca se reverte por DROP, apenas por migration nova).
