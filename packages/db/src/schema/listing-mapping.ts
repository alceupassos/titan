import { pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Mapeamento unidade <-> listing externo (seção 9.2 do prompt único): auditável, com detecção de
// drift na reconciliação (packages/domain/src/channel/reconciliation.ts). Duas unicidades: um
// listing externo só aponta para uma unidade por canal, e uma unidade só tem um listing por
// canal — evita mapeamento ambíguo em qualquer direção.
export const listingMappings = pgTable(
  "listing_mappings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => units.id),
    channel: text("channel").notNull(), // 'direct' | 'airbnb' | 'booking' | 'vrbo' | 'expedia'
    externalListingId: text("external_listing_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique("listing_mappings_tenant_channel_external_key").on(table.tenantId, table.channel, table.externalListingId),
    unique("listing_mappings_tenant_unit_channel_key").on(table.tenantId, table.unitId, table.channel),
  ],
);
