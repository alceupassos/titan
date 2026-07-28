import { date, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Divergência detectada na reconciliação (packages/domain/src/channel/reconciliation.ts:
// detectAvailabilityDrift/detectRateDrift) — abre no cockpit para correção assistida
// (seção 9.2 do prompt único), nunca corrigida automaticamente sem trilha.
export const divergences = pgTable("divergences", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  channel: text("channel").notNull(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  kind: text("kind").notNull(), // 'availability_mismatch' | 'rate_mismatch' | 'unmapped_reservation'
  date: date("date"), // ausente para divergências sem data específica (ex.: unmapped_reservation)
  detail: jsonb("detail").notNull(),
  status: text("status").notNull().default("open"), // 'open' | 'resolved'
  detectedAt: timestamp("detected_at", { withTimezone: true }).defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});
