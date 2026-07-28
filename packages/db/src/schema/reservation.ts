import { customType, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// `daterange` não tem tipo nativo no drizzle-orm — customType representa a coluna como string
// no formato de range do Postgres ("[2026-06-01,2026-06-04)") no lado TS, mantendo o tipo real
// `daterange` no banco (necessário para a constraint EXCLUDE USING gist de I1, que só existe em
// SQL puro na migration — drizzle-kit generate não sabe recriar EXCLUDE sozinho, mesma tensão já
// aceita para RLS desde a Fase 0).
const dateRange = customType<{ data: string }>({
  dataType() {
    return "daterange";
  },
});

export const reservations = pgTable("reservations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  stay: dateRange("stay").notNull(),
  status: text("status").notNull(),
  channel: text("channel").notNull(),
  externalRef: text("external_ref"),
  priceCents: integer("price_cents").notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
