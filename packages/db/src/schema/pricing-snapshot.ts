import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// I8 — "toda decisão de preço publicado deriva de uma decisão de pricing rastreável" (docs/
// invariantes.md). Espelho de packages/domain/src/pricing/ — snapshot append-only por convenção
// (mesmo espírito de evidence_log/ledger_entries): uma decisão já publicada nunca é reescrita, só
// uma linha nova para o dia seguinte. `inputs` guarda o comp set usado, a ocupação prevista e o
// piso calculado (jsonb — mesmo padrão de reference em stock_movements), para reconstruir POR QUE
// aquele preço foi sugerido, mesmo que a lógica de cálculo mude depois.
export const pricingSnapshots = pgTable("pricing_snapshots", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  date: text("date").notNull(), // CivilDate "YYYY-MM-DD" — data civil da diária precificada
  inputs: jsonb("inputs").notNull(),
  modelVersion: text("model_version").notNull(),
  suggestedPriceCents: integer("suggested_price_cents").notNull(),
  finalPriceCents: integer("final_price_cents").notNull(),
  // Nulo quando a publicação ficou dentro da faixa de autonomia (sem aprovação humana extra) —
  // preenchido com o id do usuário só quando price_out_of_band exigiu decisão via /aprovacoes.
  approvedBy: uuid("approved_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
