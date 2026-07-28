import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Fornecedor mínimo (Fase 5, AP/AR — seção 9.5 do prompt único: "fornecedores — lavanderia,
// camareira, manutenção, condomínio, IPTU, energia, internet"). Colunas de compliance/scorecard
// (taxRegime/complianceStatus/ratingAvg) chegam na Fase 7 (Suprimentos e Prestadores, migration
// 0008) via ALTER TABLE — a tabela em si nasceu na 0006 e não é recriada.
export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  document: text("document").notNull(), // CPF/CNPJ
  category: text("category").notNull(), // 'lavanderia' | 'manutencao' | 'condominio' | ...
  // Fase 7 — regime de tributação (packages/domain/src/vendor/retention.ts::VendorTaxRegime),
  // nullable até o cadastro ser completado pelo financeiro.
  taxRegime: text("tax_regime"),
  // Fase 7 — 'pending' | 'compliant' | 'non_compliant' (VendorComplianceStatus).
  complianceStatus: text("compliance_status").notNull().default("pending"),
  // Fase 7 — média simples de avaliação por OS concluída (computeVendorScoreAverage), nullable
  // até a primeira OS ser avaliada. Inteiro em pontos-base (0-500 = 0,00-5,00 estrelas) para
  // nunca guardar float — mesmo espírito de aliquotBasisPoints.
  ratingAvgBasisPoints: integer("rating_avg_basis_points"),
  // Fase 7, Passo 4b (migration 0009) — contagem de notas já incorporadas em
  // `ratingAvgBasisPoints`, para permitir recalcular a média incrementalmente
  // (`rateVendorAfterWorkOrderAction`) sem guardar cada nota individual numa tabela própria
  // (decisão de escopo documentada em ./prestadores/actions.ts). Default 0 — nenhuma nota ainda.
  ratingCount: integer("rating_count").notNull().default(0),
});
