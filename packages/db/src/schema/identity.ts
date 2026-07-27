import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Tabela mínima para provar RLS na Fase 0. Substituída/complementada pelas tabelas geradas pelo
// Better Auth (organization/session/account) na Fase 0, Passo 5 — não duplicar campos de auth
// aqui quando isso acontecer.
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
