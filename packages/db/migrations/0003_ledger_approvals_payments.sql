-- Migration 0003 — ledger básico, pagamentos e fila de aprovações (Fase 2, Passo 2).
-- APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md) — correções entram em migration nova.

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL
);

-- ledger_entries é append-only por definição (I3): GRANT abaixo concede só SELECT+INSERT a
-- titan_app, nunca UPDATE/DELETE/TRUNCATE — mesmo padrão de audit_log desde 0000_init.sql.
-- reversal_of_id é auto-referência nullable: uma linha de estorno aponta para a linha original
-- que ela corrige; a original nunca é editada. Fechamento débito==crédito por lançamento é
-- garantia de domínio (packages/domain, postDoubleEntry), não expressável como CHECK de linha
-- aqui (depende de somar várias linhas juntas).
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  account_id uuid NOT NULL REFERENCES accounts(id),
  direction text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  reservation_id uuid REFERENCES reservations(id),
  reversal_of_id uuid REFERENCES ledger_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ledger_entries_direction_check CHECK (direction IN ('debit', 'credit')),
  CONSTRAINT ledger_entries_amount_positive CHECK (amount_cents > 0)
);

-- payment_intents: idempotency_key UNIQUE é a âncora de I6 (idempotência ponta a ponta) — nenhum
-- adapter de gateway (packages/payments) cria uma segunda intenção para a mesma chave. `status`
-- espelha PaymentStatus de packages/domain/src/payment/state-machine.ts (I2); o banco não valida
-- a transição, só persiste o estado corrente.
CREATE TABLE IF NOT EXISTS payment_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  gateway text NOT NULL,
  external_id text,
  status text NOT NULL,
  idempotency_key text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_intents_gateway_check CHECK (gateway IN ('asaas', 'stripe')),
  CONSTRAINT payment_intents_idempotency_key_key UNIQUE (idempotency_key)
);

-- webhook_events: I6 (dedupe por event_id). Deliberadamente SEM tenant_id/RLS — o evento chega
-- antes de resolvermos a qual tenant ele pertence (isso acontece dentro do processamento em
-- apps/worker via lookup em payment_intents.external_id, com conexão administrativa, mesmo
-- padrão já usado em packages/db/seed/index.ts para o problema equivalente de "criar o primeiro
-- tenant"), e o dedupe precisa valer globalmente por gateway, não por tenant. Nenhum dado
-- financeiro ou PII mora aqui, só o marcador de dedupe.
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway text NOT NULL,
  external_event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_gateway_external_event_id_key UNIQUE (gateway, external_event_id)
);

-- approval_requests: fila central de aprovações (seção 9.4.2). "Nada de aprovação por chat" —
-- esta tabela e a rota (staff)/aprovacoes são o único caminho de decisão. decision_comment é
-- obrigatório em toda rejeição (regra de domínio em packages/domain/src/approval/); o banco não
-- reforça isso via CHECK porque a obrigatoriedade é condicional ao status ('rejected'), mais
-- simples de garantir na Server Action que já valida com Zod e autoriza com CASL.
CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  type text NOT NULL,
  requested_by text NOT NULL,
  rationale text NOT NULL,
  impact jsonb NOT NULL,
  risk text NOT NULL,
  required_approvals integer NOT NULL,
  step_up_required boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  sla_at timestamptz NOT NULL,
  decision_comment text,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_requests_risk_check CHECK (risk IN ('low', 'medium', 'high')),
  CONSTRAINT approval_requests_required_approvals_check CHECK (required_approvals IN (1, 2))
);

-- RLS — mesmo padrão de tenant_isolation das migrations anteriores, em toda tabela com tenant_id.
-- webhook_events fica de fora de propósito (ver nota acima).
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_accounts ON accounts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_ledger_entries ON ledger_entries
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payment_intents ON payment_intents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_approval_requests ON approval_requests
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Privilégios explícitos por tabela para titan_app — nunca ALTER DEFAULT PRIVILEGES (lição do
-- achado N1 da Fase 0).
GRANT SELECT, INSERT ON ledger_entries TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries FROM titan_app, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON accounts TO titan_app;
GRANT SELECT, INSERT, UPDATE ON payment_intents TO titan_app;
GRANT SELECT, INSERT, UPDATE ON approval_requests TO titan_app;
GRANT SELECT, INSERT ON webhook_events TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON webhook_events FROM titan_app, PUBLIC;

-- Nota de rollback: REVOKE tudo acima de titan_app; DROP POLICY tenant_isolation_approval_requests
-- ON approval_requests; DROP POLICY tenant_isolation_payment_intents ON payment_intents; DROP
-- POLICY tenant_isolation_ledger_entries ON ledger_entries; DROP POLICY tenant_isolation_accounts
-- ON accounts; DROP TABLE approval_requests; DROP TABLE webhook_events; DROP TABLE
-- payment_intents; DROP TABLE ledger_entries; DROP TABLE accounts — só em desenvolvimento local
-- (migration aplicada em produção nunca se reverte por DROP, apenas por migration nova).
