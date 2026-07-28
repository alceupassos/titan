import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Kill switch real por agente — mesmo padrão de pricing_autonomy_configs (Fase 8): configuração
// CORRENTE (UPSERT), uma linha por agente, nunca histórico append-only (diferente de
// golden_set_runs/agent_traces, que são auditoria imutável).
export const agentKillSwitches = pgTable("agent_kill_switches", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  agentName: text("agent_name").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
