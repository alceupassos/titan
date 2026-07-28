import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Configuração de autonomia de pricing por unidade (seção 9.7 do prompt único: "modo sugestão vs.
// automático por unidade, limite de variação diária com aprovação obrigatória fora da faixa").
// Uma linha por unidade (UNIQUE em unit_id) — a Server Action faz UPSERT, nunca acumula
// histórico de configuração (diferente de pricing_snapshots, que É append-only: aqui é
// configuração corrente, não decisão publicada).
export const pricingAutonomyConfigs = pgTable("pricing_autonomy_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  mode: text("mode").notNull().default("suggestion"), // 'suggestion' | 'auto'
  maxDailyVariationBasisPoints: integer("max_daily_variation_basis_points").notNull().default(1500), // 15%
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
