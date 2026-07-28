-- Migration 0006 — financeiro: contrato de administração, AP, repasse com maker-checker
-- (Fase 5, Passo 2). APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md).

-- Contrato de administração (docs/decisoes-de-negocio.md pergunta 4): comissão sempre percentual
-- fixo sobre receita BRUTA (commission_basis_points, inteiro — nunca float/numeric).
-- item_payment_model é CONFIGURÁVEL POR CONTRATO, nunca uma constante global: cada
-- proprietário/unidade escolhe entre 'titan_pays_all' e 'owner_pays_itemized'.
CREATE TABLE IF NOT EXISTS administration_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  commission_basis_points integer NOT NULL,
  item_payment_model text NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  CONSTRAINT administration_contracts_item_payment_model_check
    CHECK (item_payment_model IN ('titan_pays_all', 'owner_pays_itemized')),
  CONSTRAINT administration_contracts_validity_check CHECK (valid_from <= valid_to)
);

-- Fornecedor mínimo (seção 9.5: "fornecedores — lavanderia, camareira, manutenção, condomínio,
-- IPTU, energia, internet"). Cadastro completo (certidões/compliance/scorecard) é Fase 7.
CREATE TABLE IF NOT EXISTS vendors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL,
  document text NOT NULL,
  category text NOT NULL
);

-- Contas a pagar — reusa approval_requests já existente (tipo 'purchase_order') para "aprovação
-- em duas etapas acima do limite" (seção 9.5), nunca um fluxo de aprovação paralelo.
CREATE TABLE IF NOT EXISTS accounts_payable (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  vendor_id uuid NOT NULL REFERENCES vendors(id),
  unit_id uuid REFERENCES units(id),
  description text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  due_date date NOT NULL,
  approval_request_id uuid REFERENCES approval_requests(id),
  CONSTRAINT accounts_payable_status_check CHECK (status IN ('pending', 'approved', 'paid'))
);

-- Lote de repasse ao proprietário — Camada 2 (maker-checker) da seção 9.4.1 aplicada como
-- CONSTRAINT de banco, literal ao exemplo da spec: "quem cria o lote não aprova". Acima de
-- R$ 5.000 (docs/decisoes-de-negocio.md pergunta 5), o cockpit abre um approval_requests do tipo
-- 'payout_batch' com required_approvals=2 e step_up_required=true (Camada 3) — vínculo via
-- approval_request_id, nunca um segundo caminho de aprovação paralelo.
CREATE TABLE IF NOT EXISTS payout_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  gross_amount_cents integer NOT NULL,
  commission_amount_cents integer NOT NULL,
  expenses_amount_cents integer NOT NULL,
  net_amount_cents integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  created_by text NOT NULL,
  approved_by text,
  approval_request_id uuid REFERENCES approval_requests(id),
  CONSTRAINT payout_batches_status_check
    CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'failed')),
  CONSTRAINT payout_batches_period_check CHECK (period_start <= period_end),
  -- Camada 2 literal: nunca a mesma pessoa cria e aprova o mesmo lote.
  CONSTRAINT payout_batches_maker_checker CHECK (approved_by IS NULL OR approved_by <> created_by)
);

-- RLS — mesmo padrão tenant_isolation das migrations anteriores nas 4 tabelas.
ALTER TABLE administration_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE administration_contracts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_administration_contracts ON administration_contracts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vendors ON vendors
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE accounts_payable ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_payable FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_accounts_payable ON accounts_payable
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE payout_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_batches FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_payout_batches ON payout_batches
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Privilégios explícitos por tabela para titan_app — nunca ALTER DEFAULT PRIVILEGES (lição N1).
GRANT SELECT, INSERT, UPDATE ON administration_contracts TO titan_app;
GRANT SELECT, INSERT, UPDATE ON vendors TO titan_app;
GRANT SELECT, INSERT, UPDATE ON accounts_payable TO titan_app;
GRANT SELECT, INSERT, UPDATE ON payout_batches TO titan_app;

-- Nota de rollback: REVOKE tudo acima de titan_app; DROP POLICY tenant_isolation_payout_batches
-- ON payout_batches; DROP POLICY tenant_isolation_accounts_payable ON accounts_payable; DROP
-- POLICY tenant_isolation_vendors ON vendors; DROP POLICY
-- tenant_isolation_administration_contracts ON administration_contracts; DROP TABLE
-- payout_batches; DROP TABLE accounts_payable; DROP TABLE vendors; DROP TABLE
-- administration_contracts — só em desenvolvimento local.
