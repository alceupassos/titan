import { date, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Prazo de sinistro por canal, versionado (mesmo padrão de tax_rules/administration_contracts —
// "motor de prazos configurável por canal em tabela versionada, nunca em código", seção 9.8.7:
// "mudam sem aviso"). deadline_hours conta a partir do check-out.
export const channelClaimRules = pgTable("channel_claim_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  channel: text("channel").notNull(),
  deadlineHours: integer("deadline_hours").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
});
