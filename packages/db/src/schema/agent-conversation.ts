import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Fase 10 (Agentes) — ADR-0010: dois planos. `plane` distingue 'operator' (Hermes, staff via
// Telegram/Slack/WhatsApp) de 'platform' (runtime próprio packages/agents, Concierge/Sales/Risk).
export const agentConversations = pgTable("agent_conversations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  agentName: text("agent_name").notNull(), // ex.: 'concierge'
  agentVersion: text("agent_version").notNull(), // ex.: 'v0.1'
  plane: text("plane").notNull(), // 'operator' | 'platform'
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});
