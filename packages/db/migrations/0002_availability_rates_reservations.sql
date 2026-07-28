-- Migration 0002 — availability/tarifas/reservas (Fase 1, Passo 2).
-- APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md) — correções entram em migration nova.
-- btree_gist já habilitada em infra/postgres/init/00-extensions.sql; repetida aqui via
-- IF NOT EXISTS defensivamente, mesmo padrão de 0000_init.sql com pgcrypto.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- `units` não existia em nenhuma migration anterior — mínima o suficiente para dar a
-- reservations/rate_plans uma FK real nesta fase (inventário completo é bounded context
-- `inventory`, ainda não modelado). `status` reflete por convenção de nome a máquina de
-- estados de I9 (packages/domain/src/unit/state-machine.ts); a validação de transição é do
-- domínio, não uma CHECK constraint aqui.
CREATE TABLE IF NOT EXISTS units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'ready',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rate_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  name text NOT NULL,
  nightly_price_cents integer NOT NULL,
  currency text NOT NULL,
  min_stay_nights integer NOT NULL DEFAULT 0,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  stay daterange NOT NULL,
  status text NOT NULL,
  channel text NOT NULL,
  external_ref text,
  price_cents integer NOT NULL,
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Nenhuma reserva com estadia invertida ou de duração zero chega ao banco.
  CONSTRAINT reservations_stay_not_empty CHECK (lower(stay) < upper(stay)),
  -- A constraint central de I1: nenhuma unidade tem duas reservas pending/confirmed com
  -- estadias sobrepostas, não importa o canal — árbitro final de concorrência, nunca a
  -- checagem canAcceptReservation() do domínio sozinha (essa é só a expressão pura/preview).
  CONSTRAINT reservations_no_overlap EXCLUDE USING gist (
    unit_id WITH =,
    stay WITH &&
  ) WHERE (status IN ('pending', 'confirmed'))
);

-- RLS — mesmo padrão de tenant_isolation de 0000_init.sql/0001_app_role_grants_and_rls.sql,
-- extendido às três tabelas novas desta migration.
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE units FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_units ON units
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE rate_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_rate_plans ON rate_plans
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_reservations ON reservations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Privilégios explícitos por tabela para `titan_app` — nunca ALTER DEFAULT PRIVILEGES
-- (lição do achado N1 da Fase 0, documentada em 0001_app_role_grants_and_rls.sql).
GRANT SELECT, INSERT, UPDATE ON units TO titan_app;
GRANT SELECT, INSERT, UPDATE ON rate_plans TO titan_app;
GRANT SELECT, INSERT, UPDATE ON reservations TO titan_app;

-- Nota de rollback: REVOKE tudo acima de titan_app; DROP POLICY tenant_isolation_reservations
-- ON reservations; DROP POLICY tenant_isolation_rate_plans ON rate_plans; DROP POLICY
-- tenant_isolation_units ON units; DROP TABLE reservations; DROP TABLE rate_plans;
-- DROP TABLE units — só em desenvolvimento local (migration aplicada em produção nunca se
-- reverte por DROP, apenas por migration nova).
