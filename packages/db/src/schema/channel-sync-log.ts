import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Trilha de sincronização por canal (seção 9.2 do prompt único: painel "Saúde da Distribuição" —
// lag por canal, taxa de erro). Toda tentativa de push/pull grava uma linha aqui, sucesso ou
// falha — é a fonte dos KPIs de (staff)/distribuicao, nunca um contador em memória do worker.
export const channelSyncLog = pgTable("channel_sync_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  channel: text("channel").notNull(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  direction: text("direction").notNull(), // 'push' | 'pull'
  status: text("status").notNull(), // 'ok' | 'error'
  detail: jsonb("detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
