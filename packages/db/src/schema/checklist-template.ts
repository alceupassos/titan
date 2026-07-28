import { date, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Template de checklist versionado (seção 9.8.4 do prompt único) — "snapshot imutável do
// template na execução": cleaning_tasks/work_orders referenciam (templateId, version) fixos no
// momento da criação, nunca "o template atual". Nova versão é uma linha nova, nunca UPDATE do
// conteúdo (mesmo espírito de tax_rules/administration_contracts — versionado por vigência).
export const checklistTemplates = pgTable("checklist_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  version: integer("version").notNull(),
  serviceType: text("service_type").notNull(),
  // Sections/items (packages/domain/src/housekeeping/checklist.ts: ChecklistSection[]) — jsonb
  // em vez de tabelas normalizadas: o conteúdo é imutável por versão, lido inteiro de uma vez
  // para cálculo de score, nunca consultado item a item via SQL.
  sections: jsonb("sections").notNull(),
  passingScore: integer("passing_score").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
});
