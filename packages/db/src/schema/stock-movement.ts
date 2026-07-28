import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Espelho de packages/domain/src/supply/stock.ts::StockMovement — append-only por convenção de
// auditoria (mesmo espírito de evidence_log/ledger_entries, embora movimento de estoque não seja
// uma das 10 invariantes formais; decisão de simplicidade desta fase, não regra dura). `quantity`
// é sempre positivo (CHECK na migration) — a direção vem de `type`, nunca de quantity negativo.
// `reference` guarda o contexto do movimento (ex.: { cleaningTaskId } quando é consumo de virada).
export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  itemType: text("item_type").notNull(),
  type: text("type").notNull(), // 'purchase' | 'consumption' | 'adjustment' | 'loss' | 'return'
  quantity: integer("quantity").notNull(),
  // Fase 8 (Pricing) — só populado em movimentos type='purchase'; fecha a lacuna identificada
  // nesta sessão entre a Fase 7 (que só modelava QUANTIDADE) e o requisito do roadmap de "custo
  // variável real" como piso de preço (packages/domain/src/pricing/variable-cost.ts). Nullable
  // porque consumo/perda/ajuste/devolução não têm um custo unitário próprio nesta fase.
  unitCostCents: integer("unit_cost_cents"),
  reference: jsonb("reference"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
