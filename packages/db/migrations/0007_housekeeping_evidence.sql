-- Migration 0007 — limpeza e evidência: cadeia de evidência, checklists, viradas, OS, prazo de
-- sinistro (Fase 6, Passo 2). APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md).

-- I10 — evidência nunca é excluída, apenas marcada como descartada com motivo. Append-only
-- REAL: GRANT abaixo concede só SELECT+INSERT a titan_app, nunca UPDATE/DELETE/TRUNCATE, mesmo
-- padrão de audit_log/ledger_entries. NENHUMA rota de exclusão para nenhum papel (anti-padrão
-- #19), incluindo titan.owner.
CREATE TABLE IF NOT EXISTS evidence_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  kind text NOT NULL,
  entry_hash text NOT NULL,
  prev_hash text,
  content_hash text,
  assurance_level text,
  envelope jsonb,
  discarded_entry_hash text,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT evidence_log_kind_check CHECK (kind IN ('capture', 'discard')),
  CONSTRAINT evidence_log_entry_hash_key UNIQUE (entry_hash),
  CONSTRAINT evidence_log_assurance_level_check
    CHECK (assurance_level IS NULL OR assurance_level IN ('A0', 'A1', 'A2', 'A3'))
);

CREATE TABLE IF NOT EXISTS checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  version integer NOT NULL,
  service_type text NOT NULL,
  sections jsonb NOT NULL,
  passing_score integer NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  CONSTRAINT checklist_templates_validity_check CHECK (valid_from <= valid_to)
);

CREATE TABLE IF NOT EXISTS cleaning_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  checklist_template_id uuid NOT NULL REFERENCES checklist_templates(id),
  checklist_template_version integer NOT NULL,
  assigned_to text NOT NULL,
  status text NOT NULL DEFAULT 'cleaning',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  score_percent integer,
  passed boolean,
  CONSTRAINT cleaning_tasks_status_check CHECK (status IN ('cleaning', 'clean', 'inspected', 'rework'))
);

CREATE TABLE IF NOT EXISTS work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  service_type text NOT NULL,
  vendor_id uuid REFERENCES vendors(id),
  status text NOT NULL DEFAULT 'opened',
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_orders_status_check CHECK (
    status IN ('opened', 'triage', 'budget', 'dispatched', 'accepted_vendor', 'executing',
               'accepted_titan', 'rework', 'billed', 'paid', 'rated')
  )
);

CREATE TABLE IF NOT EXISTS channel_claim_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  channel text NOT NULL,
  deadline_hours integer NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  CONSTRAINT channel_claim_rules_validity_check CHECK (valid_from <= valid_to)
);

CREATE TABLE IF NOT EXISTS claim_dossiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  channel text NOT NULL,
  claim_deadline_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open',
  evidence_log_ids jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT claim_dossiers_status_check CHECK (status IN ('open', 'submitted', 'expired'))
);

ALTER TABLE evidence_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_evidence_log ON evidence_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE checklist_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_checklist_templates ON checklist_templates
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE cleaning_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cleaning_tasks FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_cleaning_tasks ON cleaning_tasks
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_work_orders ON work_orders
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE channel_claim_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_claim_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_channel_claim_rules ON channel_claim_rules
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE claim_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_dossiers FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_claim_dossiers ON claim_dossiers
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT ON evidence_log TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON evidence_log FROM titan_app, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON checklist_templates TO titan_app;
GRANT SELECT, INSERT, UPDATE ON cleaning_tasks TO titan_app;
GRANT SELECT, INSERT, UPDATE ON work_orders TO titan_app;
GRANT SELECT, INSERT, UPDATE ON channel_claim_rules TO titan_app;
GRANT SELECT, INSERT, UPDATE ON claim_dossiers TO titan_app;

-- Nota de rollback (só desenvolvimento local): reverter esta migration exigiria remover os
-- privilégios concedidos acima, as 6 políticas de isolamento por tenant, e as 6 tabelas criadas
-- nesta migration, na ordem inversa de dependência.
