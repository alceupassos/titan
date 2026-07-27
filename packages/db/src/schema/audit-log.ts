import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Seção 5.3 do prompt único: toda ação sensível grava actor_type/actor_id/diff. Append-only —
// sem UPDATE/DELETE concedido a nenhum papel de aplicação.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  actorType: text("actor_type").notNull(), // 'user' | 'agent' | 'system'
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  diff: jsonb("diff"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
