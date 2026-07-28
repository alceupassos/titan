import { integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Catálogo de item de estoque POR UNIDADE — não um pool centralizado da Titan, consequência
// direta de docs/decisoes-de-negocio.md pergunta 7 (confirmada: o enxoval é do PROPRIETÁRIO de
// cada unidade, não da Titan). minQuantity/leadTimeDays/safetyStockDays alimentam
// packages/domain/src/supply/stock.ts::computeReorderPoint (heurística determinística, não ML —
// ver comentário no domínio).
export const stockItems = pgTable("stock_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  itemType: text("item_type").notNull(), // ex.: 'lencol_casal', 'toalha_banho', 'amenity_shampoo'
  minQuantity: integer("min_quantity").notNull(),
  leadTimeDays: integer("lead_time_days").notNull(),
  safetyStockDays: integer("safety_stock_days").notNull(),
});
