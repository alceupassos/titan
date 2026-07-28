import { date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Preço em CENTAVOS inteiros (regra dura do CLAUDE.md) — nunca number/float na aplicação;
// packages/money reforça isso do lado do domínio, esta coluna é o espelho no banco.
export const ratePlans = pgTable("rate_plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  name: text("name").notNull(),
  nightlyPriceCents: integer("nightly_price_cents").notNull(),
  currency: text("currency").notNull(),
  minStayNights: integer("min_stay_nights").notNull().default(0),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
