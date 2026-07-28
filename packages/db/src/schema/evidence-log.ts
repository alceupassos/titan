import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// I10 — evidência fotográfica nunca é excluída por nenhum papel; apenas marcada como descartada
// com motivo. Espelho no banco de packages/domain/src/evidence/chain.ts (EvidenceEntry) —
// append-only real: GRANT abaixo concede só SELECT+INSERT a titan_app, nunca UPDATE/DELETE/
// TRUNCATE, mesmo padrão de audit_log/ledger_entries. NENHUMA rota de exclusão existe para
// nenhum papel, incluindo titan.owner (anti-padrão #19).
export const evidenceLog = pgTable("evidence_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  kind: text("kind").notNull(), // 'capture' | 'discard'
  entryHash: text("entry_hash").notNull().unique(),
  prevHash: text("prev_hash"),
  // Campos de 'capture' — nulos para 'discard'.
  contentHash: text("content_hash"),
  assuranceLevel: text("assurance_level"), // 'A0' | 'A1' | 'A2' | 'A3'
  envelope: jsonb("envelope"),
  // Campos de 'discard' — nulos para 'capture'.
  discardedEntryHash: text("discarded_entry_hash"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
