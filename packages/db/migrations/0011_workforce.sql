-- Migration 0011 — pessoas e campo: cadastro de equipe, custódia de acesso, escala, produtividade
-- (Fase 9, Passo 2). APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md).

-- Cadastro operacional da equipe de campo (seção 9.11.7). employment_type inclui 'unspecified'
-- porque a pergunta 3 de docs/decisoes-de-negocio.md (vínculo: CLT/PJ/terceirizada) segue
-- pendente por decisão do usuário — packages/domain/src/workforce/assignment.ts trata esse valor
-- como padrão conservador (escala nunca obrigatória sem vínculo confirmado). Nunca ponto oficial/
-- folha (docs/adr/0011-ponto-eletronico-nao-construir.md).
CREATE TABLE IF NOT EXISTS workforce_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  full_name text NOT NULL,
  role text NOT NULL,
  zones jsonb NOT NULL,
  skills jsonb NOT NULL,
  certifications jsonb NOT NULL,
  employment_type text NOT NULL DEFAULT 'unspecified',
  status text NOT NULL DEFAULT 'active',
  CONSTRAINT workforce_members_employment_type_check
    CHECK (employment_type IN ('employee', 'contractor', 'unspecified')),
  CONSTRAINT workforce_members_status_check CHECK (status IN ('active', 'dismissed'))
);

-- Espelho de packages/domain/src/workforce/access-custody.ts — cadeia hash-encadeada de custódia
-- de acesso (chave física, código digital, acesso de app), append-only por padrão de auditoria
-- sensível (só SELECT+INSERT concedido, nenhuma escrita mutável posterior). Prova o portão de
-- saída "revogação de desligamento provada" — o desligamento grava um evento 'revoked' aqui para
-- cada credencial ativa do membro, na mesma transação.
CREATE TABLE IF NOT EXISTS access_credential_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  entry_hash text NOT NULL,
  prev_hash text,
  kind text NOT NULL,
  member_id uuid NOT NULL REFERENCES workforce_members(id),
  credential_type text NOT NULL,
  credential_id text NOT NULL,
  reason text,
  envelope jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT access_credential_events_kind_check CHECK (kind IN ('issued', 'transferred', 'revoked')),
  CONSTRAINT access_credential_events_credential_type_check
    CHECK (credential_type IN ('physical_key', 'digital_code', 'app_access')),
  CONSTRAINT access_credential_events_entry_hash_key UNIQUE (entry_hash)
);

-- Escala de campo — status inicial ('accepted' vs. 'proposed') decidido pelo domínio via
-- resolveAssignmentMode(employmentType); esta tabela só persiste o resultado.
CREATE TABLE IF NOT EXISTS shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  member_id uuid NOT NULL REFERENCES workforce_members(id),
  date date NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  CONSTRAINT shift_assignments_status_check
    CHECK (status IN ('proposed', 'accepted', 'declined', 'completed'))
);

-- Registro de conclusão de tarefa (app de campo + cockpit) — alimenta computeProductivityScore/
-- flagSuspiciousCompletions. task_id é texto livre (referência a cleaning_tasks/work_orders sem
-- FK obrigatória, mesmo espírito de assigned_to em cleaning_tasks).
CREATE TABLE IF NOT EXISTS task_completion_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  member_id uuid NOT NULL REFERENCES workforce_members(id),
  task_id text NOT NULL,
  evidence_hashes jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workforce_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workforce_members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_workforce_members ON workforce_members
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE access_credential_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_credential_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_access_credential_events ON access_credential_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE shift_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_shift_assignments ON shift_assignments
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE task_completion_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_completion_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_task_completion_records ON task_completion_records
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON workforce_members TO titan_app;

-- access_credential_events: append-only real — só SELECT+INSERT, nunca escrita mutável depois,
-- mesmo padrão já usado em outras tabelas de auditoria sensível deste monorepo.
GRANT SELECT, INSERT ON access_credential_events TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON access_credential_events FROM titan_app, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON shift_assignments TO titan_app;
GRANT SELECT, INSERT ON task_completion_records TO titan_app;

-- Nota de rollback (só desenvolvimento local): reverter esta migration exigiria remover os
-- privilégios concedidos acima, as 4 políticas de isolamento por tenant, e as 4 tabelas criadas
-- nesta migration, na ordem inversa de dependência.
