-- Migration 0005 — fiscal: tax_rules versionada, fiscal_documents (Fase 4, Passo 2).
-- APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md).

-- Regra dura: "Alíquota, código de serviço, retenção e prazo de canal: tabela versionada. Nunca
-- código." aliquot_basis_points é inteiro (pontos-base, ex. 500 = 5,00%), nunca float/numeric.
CREATE TABLE IF NOT EXISTS tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  municipality_code text NOT NULL,
  service_code text NOT NULL,
  aliquot_basis_points integer NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  CONSTRAINT tax_rules_validity_check CHECK (valid_from <= valid_to)
);

-- I7 — documento fiscal emitido não é editável, só cancelado/substituído. natural_key é a âncora
-- de idempotência forte (seção 9.6 do prompt único): UNIQUE garante que retry nunca produz duas
-- notas para o mesmo fato gerador — persistida ANTES de qualquer chamada ao gateway
-- (packages/fiscal), a segunda tentativa encontra a linha já existente e não chama o provedor de
-- novo. GRANT abaixo concede UPDATE só para permitir a transição de status/campos de controle
-- (pending -> issued/rejected, cancelamento) — o CONTEÚDO fiscal em si (base_amount_cents,
-- tax_amount_cents, municipality_code, service_code) nunca deveria ser reescrito depois de
-- issued; essa garantia fica no domínio (assertNotEditingIssuedDocument), não expressável como
-- CHECK de coluna aqui sem um trigger dedicado (fora de escopo desta migration).
CREATE TABLE IF NOT EXISTS fiscal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  natural_key text NOT NULL,
  municipality_code text NOT NULL,
  service_code text NOT NULL,
  base_amount_cents integer NOT NULL,
  tax_amount_cents integer NOT NULL,
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  external_invoice_id text,
  xml_storage_ref text,
  pdf_storage_ref text,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz,
  CONSTRAINT fiscal_documents_natural_key_key UNIQUE (natural_key),
  CONSTRAINT fiscal_documents_status_check CHECK (status IN ('pending', 'issued', 'rejected', 'cancelled', 'substituted'))
);

-- RLS — mesmo padrão tenant_isolation das migrations anteriores.
ALTER TABLE tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_tax_rules ON tax_rules
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE fiscal_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_fiscal_documents ON fiscal_documents
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Privilégios explícitos por tabela para titan_app — nunca ALTER DEFAULT PRIVILEGES (lição N1).
GRANT SELECT, INSERT ON tax_rules TO titan_app;
GRANT SELECT, INSERT, UPDATE ON fiscal_documents TO titan_app;

-- Nota de rollback: REVOKE tudo acima de titan_app; DROP POLICY tenant_isolation_fiscal_documents
-- ON fiscal_documents; DROP POLICY tenant_isolation_tax_rules ON tax_rules; DROP TABLE
-- fiscal_documents; DROP TABLE tax_rules — só em desenvolvimento local.
