import { integer, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { accounts } from "./account";
import { reservations } from "./reservation";

// I3 — todo lançamento financeiro é imutável; correção só por lançamento de estorno. Espelho no
// banco de `packages/domain/src/ledger/ledger-entry.ts` — append-only por definição (grants no
// final desta migration: SELECT+INSERT a `titan_app`, nunca UPDATE/DELETE/TRUNCATE, mesmo padrão
// já usado para `audit_log` desde 0000_init.sql). `reversalOfId` é auto-referência nullable: uma
// linha de estorno aponta para a linha original que ela corrige; a linha original nunca é
// mutada. A garantia de que débito==crédito por lançamento é do domínio
// (`postDoubleEntry`, packages/domain) — não expressável como CHECK de linha no Postgres, já que
// depende de somar várias linhas juntas.
export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  accountId: uuid("account_id")
    .notNull()
    .references(() => accounts.id),
  direction: text("direction").notNull(), // 'debit' | 'credit'
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  reservationId: uuid("reservation_id").references(() => reservations.id),
  reversalOfId: uuid("reversal_of_id").references((): AnyPgColumn => ledgerEntries.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
