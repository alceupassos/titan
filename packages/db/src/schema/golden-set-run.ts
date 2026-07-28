import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Histórico append-only de execuções do golden-set (packages/agents/src/golden-set.ts) — cada
// execução vira uma linha nova, nunca sobrescrita; auditável ao longo do tempo (acurácia caindo
// numa mudança de prompt/versão fica visível no histórico, nunca escondida por um UPDATE).
export const goldenSetRuns = pgTable("golden_set_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  agentName: text("agent_name").notNull(),
  agentVersion: text("agent_version").notNull(),
  caseCount: integer("case_count").notNull(),
  accuracyBasisPoints: integer("accuracy_basis_points").notNull(), // ex. 9000 = 90,00%
  targetAccuracyBasisPoints: integer("target_accuracy_basis_points").notNull(),
  metTarget: boolean("met_target").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
