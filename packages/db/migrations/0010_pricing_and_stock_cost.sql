-- Migration 0010 — custo de estoque + snapshots de decisão de pricing (Fase 8, Passo 2).
-- APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md).

-- Fecha a lacuna identificada nesta sessão: a Fase 7 (migrations 0008/0009) modelava só
-- QUANTIDADE de estoque, nunca custo. O roadmap condiciona o piso de preço da Fase 8 a "custo
-- variável real" (senão "o piso é chutado") — este campo torna real o custo de reposição de
-- enxoval/amenities por unidade. Só populado em movimentos type='purchase' (CHECK abaixo).
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS unit_cost_cents integer;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_unit_cost_cents_check
  CHECK (unit_cost_cents IS NULL OR (unit_cost_cents >= 0 AND type = 'purchase'));

-- I8 — "toda decisão de preço publicado deriva de uma decisão de pricing rastreável". Append-only
-- por convenção (mesmo espírito de evidence_log/ledger_entries): uma decisão já publicada nunca é
-- reescrita, só uma linha nova para o dia seguinte. `inputs` guarda o comp set usado, a ocupação
-- prevista e o piso calculado.
CREATE TABLE IF NOT EXISTS pricing_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  date text NOT NULL,
  inputs jsonb NOT NULL,
  model_version text NOT NULL,
  suggested_price_cents integer NOT NULL,
  final_price_cents integer NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_snapshots_date_format_check CHECK (date ~ '^\d{4}-\d{2}-\d{2}$'),
  CONSTRAINT pricing_snapshots_unit_date_key UNIQUE (unit_id, date)
);

-- Configuração de autonomia de pricing por unidade (seção 9.7: modo sugestão vs. automático,
-- limite de variação diária). Uma linha por unidade (UNIQUE) — configuração CORRENTE, a Server
-- Action faz UPSERT; diferente de pricing_snapshots, que é histórico append-only de decisões já
-- publicadas.
CREATE TABLE IF NOT EXISTS pricing_autonomy_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  mode text NOT NULL DEFAULT 'suggestion',
  max_daily_variation_basis_points integer NOT NULL DEFAULT 1500,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_autonomy_configs_mode_check CHECK (mode IN ('suggestion', 'auto')),
  CONSTRAINT pricing_autonomy_configs_unit_key UNIQUE (unit_id)
);

ALTER TABLE pricing_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pricing_snapshots ON pricing_snapshots
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE pricing_autonomy_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_autonomy_configs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_pricing_autonomy_configs ON pricing_autonomy_configs
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Append-only real: só SELECT+INSERT a titan_app, nunca UPDATE/DELETE/TRUNCATE, mesmo padrão de
-- evidence_log/ledger_entries — uma decisão de preço publicada nunca é corrigida por edição, só
-- por uma nova linha (novo dia, ou reprocessamento explícito registrado como nova decisão).
GRANT SELECT, INSERT ON pricing_snapshots TO titan_app;
REVOKE UPDATE, DELETE, TRUNCATE ON pricing_snapshots FROM titan_app, PUBLIC;

GRANT SELECT, INSERT, UPDATE ON pricing_autonomy_configs TO titan_app;

-- Nota de rollback (só desenvolvimento local): reverter esta migration exigiria remover a
-- constraint e a coluna adicionadas a stock_movements, os privilégios concedidos acima, as 2
-- políticas de isolamento por tenant, e as 2 tabelas criadas nesta migration.
