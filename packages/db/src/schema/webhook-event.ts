import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

// I6 — dedupe de webhook por `event_id`. Nenhum processamento de webhook (apps/worker) roda sem
// primeiro tentar INSERT aqui via `ON CONFLICT (gateway, external_event_id) DO NOTHING` — se o
// conflito disparar, o evento já foi processado, descarta. Sem `tenant_id`/RLS: o evento chega
// antes de resolvermos a qual tenant ele pertence (isso acontece dentro do processamento), e o
// dedupe precisa valer globalmente por gateway, não por tenant.
export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gateway: text("gateway").notNull(), // 'asaas' | 'stripe'
    externalEventId: text("external_event_id").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique("webhook_events_gateway_external_event_id_key").on(table.gateway, table.externalEventId)],
);
