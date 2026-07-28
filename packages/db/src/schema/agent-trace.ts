import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { agentConversations } from "./agent-conversation";

// Trace de conversa de agente — append-only real (mesmo padrão de evidence_log/ledger_entries: só
// SELECT+INSERT concedido). `contentRedacted` nunca guarda PII bruta — redaction é
// responsabilidade da borda (packages/agents) antes do INSERT, nunca deste schema. `costCents`
// vem de packages/agents/src/cost.ts::computeConversationCostCents — nunca calculado aqui.
export const agentTraces = pgTable("agent_traces", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => agentConversations.id),
  role: text("role").notNull(), // 'user' | 'agent' | 'tool'
  contentRedacted: text("content_redacted").notNull(),
  toolName: text("tool_name"),
  tokenUsage: jsonb("token_usage"),
  costCents: integer("cost_cents").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
