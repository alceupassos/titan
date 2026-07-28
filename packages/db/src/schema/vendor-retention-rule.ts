import { date, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Espelho de packages/domain/src/vendor/retention.ts::VendorRetentionRule — tabela versionada por
// vigência (mesmo padrão de tax_rules/channel_claim_rules/administration_contracts), regra dura
// do CLAUDE.md raiz ("alíquota, código de serviço, retenção e prazo de canal: tabela versionada,
// nunca código") aplicada à retenção de prestador (seção 9.10.3). Alíquotas de exemplo cadastradas
// aqui precisam de confirmação formal do contador antes de produção real, mesma ressalva já usada
// para tax_rules desde a Fase 4.
export const vendorRetentionRules = pgTable("vendor_retention_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  taxRegime: text("tax_regime").notNull(), // 'pj_cessao_mao_obra' | 'pj_simples' | 'pf_autonomo'
  inssBasisPoints: integer("inss_basis_points").notNull(),
  irrfBasisPoints: integer("irrf_basis_points").notNull(),
  csrfBasisPoints: integer("csrf_basis_points").notNull(),
  issBasisPoints: integer("iss_basis_points").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
});
