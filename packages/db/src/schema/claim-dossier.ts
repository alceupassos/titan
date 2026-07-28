import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";
import { reservations } from "./reservation";

// Dossiê de sinistro (seção 9.8.7 do prompt único) — montado a partir de evidências, com prazo
// por canal (channel_claim_rules). "Meta do módulo: zero sinistro perdido por prazo."
// `evidenceLogIds` referencia entradas de `evidence_log` (append-only, I10) relevantes ao
// dossiê — jsonb (array de uuid) em vez de tabela de junção própria, dado o volume baixo por
// dossiê e a simplicidade de montar/ler o conjunto inteiro de uma vez.
export const claimDossiers = pgTable("claim_dossiers", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  reservationId: uuid("reservation_id")
    .notNull()
    .references(() => reservations.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  channel: text("channel").notNull(),
  claimDeadlineAt: timestamp("claim_deadline_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("open"), // 'open' | 'submitted' | 'expired'
  evidenceLogIds: jsonb("evidence_log_ids").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
