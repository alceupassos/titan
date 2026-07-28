-- Migration 0004 — distribuição de canais: mapeamento, trilha de sincronização, divergências
-- (Fase 3, Passo 2). APLICADA NUNCA É ALTERADA (regra dura do CLAUDE.md).

-- Mapeamento auditável unidade <-> listing externo (seção 9.2). Duas unicidades: um listing
-- externo aponta para uma única unidade por canal, e uma unidade tem um único listing por canal.
CREATE TABLE IF NOT EXISTS listing_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  unit_id uuid NOT NULL REFERENCES units(id),
  channel text NOT NULL,
  external_listing_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT listing_mappings_tenant_channel_external_key UNIQUE (tenant_id, channel, external_listing_id),
  CONSTRAINT listing_mappings_tenant_unit_channel_key UNIQUE (tenant_id, unit_id, channel)
);

-- Trilha de sincronização por canal — fonte dos KPIs do painel "Saúde da Distribuição"
-- (staff)/distribuicao: lag por canal, taxa de erro. Toda tentativa de push/pull grava uma linha,
-- sucesso ou falha.
CREATE TABLE IF NOT EXISTS channel_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  channel text NOT NULL,
  unit_id uuid NOT NULL REFERENCES units(id),
  direction text NOT NULL,
  status text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT channel_sync_log_direction_check CHECK (direction IN ('push', 'pull')),
  CONSTRAINT channel_sync_log_status_check CHECK (status IN ('ok', 'error'))
);

-- Divergência detectada na reconciliação (packages/domain/src/channel/reconciliation.ts) — abre
-- no cockpit para correção assistida, nunca corrigida automaticamente sem trilha.
CREATE TABLE IF NOT EXISTS divergences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  channel text NOT NULL,
  unit_id uuid NOT NULL REFERENCES units(id),
  kind text NOT NULL,
  date date,
  detail jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open',
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CONSTRAINT divergences_kind_check CHECK (kind IN ('availability_mismatch', 'rate_mismatch', 'unmapped_reservation')),
  CONSTRAINT divergences_status_check CHECK (status IN ('open', 'resolved'))
);

-- RLS — mesmo padrão tenant_isolation das migrations anteriores nas 3 tabelas.
ALTER TABLE listing_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_mappings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_listing_mappings ON listing_mappings
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE channel_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_sync_log FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_channel_sync_log ON channel_sync_log
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE divergences ENABLE ROW LEVEL SECURITY;
ALTER TABLE divergences FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_divergences ON divergences
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Privilégios explícitos por tabela para titan_app — nunca ALTER DEFAULT PRIVILEGES (lição N1).
GRANT SELECT, INSERT, UPDATE ON listing_mappings TO titan_app;
GRANT SELECT, INSERT ON channel_sync_log TO titan_app;
GRANT SELECT, INSERT, UPDATE ON divergences TO titan_app;

-- Nota de rollback: REVOKE tudo acima de titan_app; DROP POLICY tenant_isolation_divergences ON
-- divergences; DROP POLICY tenant_isolation_channel_sync_log ON channel_sync_log; DROP POLICY
-- tenant_isolation_listing_mappings ON listing_mappings; DROP TABLE divergences; DROP TABLE
-- channel_sync_log; DROP TABLE listing_mappings — só em desenvolvimento local.
