-- Migration 0008 — suprimentos e prestadores: retenção fiscal de prestador, estoque por unidade
-- (Fase 7, Passo 2). APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md).

-- Retenção fiscal de prestador (seção 9.10.3), versionada por vigência — espelho de
-- packages/domain/src/vendor/retention.ts::VendorRetentionRule. Alíquotas de exemplo cadastradas
-- via seed precisam de confirmação formal do contador antes de produção real (mesma ressalva já
-- usada para tax_rules desde a Fase 4).
CREATE TABLE IF NOT EXISTS vendor_retention_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  tax_regime text NOT NULL,
  inss_basis_points integer NOT NULL,
  irrf_basis_points integer NOT NULL,
  csrf_basis_points integer NOT NULL,
  iss_basis_points integer NOT NULL,
  valid_from date NOT NULL,
  valid_to date NOT NULL,
  CONSTRAINT vendor_retention_rules_tax_regime_check
    CHECK (tax_regime IN ('pj_cessao_mao_obra', 'pj_simples', 'pf_autonomo')),
  CONSTRAINT vendor_retention_rules_validity_check CHECK (valid_from <= valid_to)
);

-- Catálogo de item de estoque POR UNIDADE (docs/decisoes-de-negocio.md pergunta 7, confirmada: o
-- enxoval é do proprietário de cada unidade, não da Titan — nunca um pool centralizado).
CREATE TABLE IF NOT EXISTS stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  item_type text NOT NULL,
  min_quantity integer NOT NULL,
  lead_time_days integer NOT NULL,
  safety_stock_days integer NOT NULL,
  CONSTRAINT stock_items_min_quantity_check CHECK (min_quantity >= 0),
  CONSTRAINT stock_items_lead_time_days_check CHECK (lead_time_days >= 0),
  CONSTRAINT stock_items_safety_stock_days_check CHECK (safety_stock_days >= 0)
);

-- Movimento de estoque — append-only por convenção de auditoria (mesmo espírito de
-- evidence_log/ledger_entries, embora não seja uma das 10 invariantes formais; decisão de
-- simplicidade desta fase). Espelho de packages/domain/src/supply/stock.ts::StockMovement:
-- quantity é sempre positivo, a direção do movimento vem de type.
CREATE TABLE IF NOT EXISTS stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  item_type text NOT NULL,
  type text NOT NULL,
  quantity integer NOT NULL,
  reference jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_movements_type_check
    CHECK (type IN ('purchase', 'consumption', 'adjustment', 'loss', 'return')),
  CONSTRAINT stock_movements_quantity_check CHECK (quantity > 0)
);

-- Nível de estoque materializado por unidade/item — atualizado na mesma transação do INSERT em
-- stock_movements pela Server Action (nunca por trigger de banco nesta fase, sem Docker/daemon
-- real para testar trigger). A fonte de verdade continua sendo stock_movements;
-- reconstructStockLevel prova que os dois batem (portão de saída da fase).
CREATE TABLE IF NOT EXISTS stock_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  item_type text NOT NULL,
  quantity integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stock_balances_unit_item_key UNIQUE (unit_id, item_type)
);

-- Estende vendors (Fase 5, migration 0006) com compliance/scorecard do prestador — nunca recria a
-- tabela. taxRegime nullable até o cadastro ser completado pelo financeiro; compliance_status
-- default 'pending' (nenhuma certidão real verificada nesta sessão, campo manual);
-- rating_avg_basis_points nullable até a primeira OS ser avaliada (computeVendorScoreAverage).
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tax_regime text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS compliance_status text NOT NULL DEFAULT 'pending';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS rating_avg_basis_points integer;
ALTER TABLE vendors ADD CONSTRAINT vendors_tax_regime_check
  CHECK (tax_regime IS NULL OR tax_regime IN ('pj_cessao_mao_obra', 'pj_simples', 'pf_autonomo'));
ALTER TABLE vendors ADD CONSTRAINT vendors_compliance_status_check
  CHECK (compliance_status IN ('pending', 'compliant', 'non_compliant'));

-- Estende accounts_payable (Fase 5, migration 0006) com o snapshot de retenção calculado no
-- momento do pagamento do prestador — nunca recria a tabela. Nullable até payVendorInvoiceAction
-- efetivar o pagamento; persistido como jsonb porque é o registro do que foi de fato retido
-- naquele pagamento específico, não recalculado depois se a vendor_retention_rule mudar.
ALTER TABLE accounts_payable ADD COLUMN IF NOT EXISTS retention_breakdown jsonb;

ALTER TABLE vendor_retention_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_retention_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_vendor_retention_rules ON vendor_retention_rules
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE stock_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_items FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_stock_items ON stock_items
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_stock_movements ON stock_movements
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE stock_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_balances FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_stock_balances ON stock_balances
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON vendor_retention_rules TO titan_app;
GRANT SELECT, INSERT, UPDATE ON stock_items TO titan_app;

-- stock_movements: append-only por convenção (ver comentário da tabela acima) — só SELECT+INSERT,
-- nunca UPDATE/DELETE/TRUNCATE, mesmo padrão de evidence_log/ledger_entries.
GRANT SELECT, INSERT ON stock_movements TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON stock_movements FROM titan_app, PUBLIC;

-- stock_balances é materializado e É atualizado (UPDATE) pela Server Action na mesma transação do
-- INSERT em stock_movements — não é append-only.
GRANT SELECT, INSERT, UPDATE ON stock_balances TO titan_app;

-- Nota de rollback (só desenvolvimento local): reverter esta migration exigiria remover as 3
-- colunas adicionadas a vendors, a coluna adicionada a accounts_payable, os privilégios
-- concedidos acima, as 4 políticas de isolamento por tenant, e as 4 tabelas criadas nesta
-- migration, na ordem inversa de dependência.
