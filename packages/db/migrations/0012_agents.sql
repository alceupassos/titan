-- Migration 0012 — agentes: conversas, trace, golden-set, kill switch (Fase 10, Passo 2).
-- APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md).

-- ADR-0010: dois planos. plane distingue 'operator' (Hermes, staff via Telegram/Slack/WhatsApp)
-- de 'platform' (runtime próprio packages/agents, Concierge/Sales/Risk).
CREATE TABLE IF NOT EXISTS agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_name text NOT NULL,
  agent_version text NOT NULL,
  plane text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT agent_conversations_plane_check CHECK (plane IN ('operator', 'platform'))
);

-- Trace de conversa — append-only real (mesmo padrão de evidence_log/ledger_entries: só
-- SELECT+INSERT concedido). content_redacted nunca guarda PII bruta — redaction é
-- responsabilidade da borda (packages/agents) antes do INSERT.
CREATE TABLE IF NOT EXISTS agent_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  conversation_id uuid NOT NULL REFERENCES agent_conversations(id),
  role text NOT NULL,
  content_redacted text NOT NULL,
  tool_name text,
  token_usage jsonb,
  cost_cents integer NOT NULL DEFAULT 0,
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_traces_role_check CHECK (role IN ('user', 'agent', 'tool')),
  CONSTRAINT agent_traces_cost_cents_check CHECK (cost_cents >= 0),
  CONSTRAINT agent_traces_latency_ms_check CHECK (latency_ms >= 0)
);

-- Histórico append-only de execuções do golden-set (packages/agents/src/golden-set.ts) — cada
-- execução vira uma linha nova, nunca sobrescrita.
CREATE TABLE IF NOT EXISTS golden_set_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_name text NOT NULL,
  agent_version text NOT NULL,
  case_count integer NOT NULL,
  accuracy_basis_points integer NOT NULL,
  target_accuracy_basis_points integer NOT NULL,
  met_target boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golden_set_runs_case_count_check CHECK (case_count > 0),
  CONSTRAINT golden_set_runs_accuracy_check CHECK (accuracy_basis_points BETWEEN 0 AND 10000)
);

-- Kill switch real por agente — mesmo padrão de pricing_autonomy_configs (Fase 8): configuração
-- CORRENTE (UPSERT), uma linha por agente.
CREATE TABLE IF NOT EXISTS agent_kill_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  agent_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_kill_switches_agent_name_key UNIQUE (agent_name)
);

ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_conversations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agent_conversations ON agent_conversations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE agent_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_traces FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agent_traces ON agent_traces
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE golden_set_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE golden_set_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_golden_set_runs ON golden_set_runs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE agent_kill_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_kill_switches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_agent_kill_switches ON agent_kill_switches
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON agent_conversations TO titan_app;

-- agent_traces: append-only real — só SELECT+INSERT, nunca UPDATE/DELETE/TRUNCATE.
GRANT SELECT, INSERT ON agent_traces TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON agent_traces FROM titan_app, PUBLIC;

-- golden_set_runs: append-only real — mesmo motivo (histórico de acurácia nunca reescrito).
GRANT SELECT, INSERT ON golden_set_runs TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON golden_set_runs FROM titan_app, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON agent_kill_switches TO titan_app;

-- Nota de rollback (só desenvolvimento local): reverter esta migration exigiria remover os
-- privilégios concedidos acima, as 4 políticas de isolamento por tenant, e as 4 tabelas criadas
-- nesta migration, na ordem inversa de dependência.
