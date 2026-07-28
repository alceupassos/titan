import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { reservations } from "./reservation";

// Âncora de I6 (idempotência ponta a ponta): `idempotencyKey` único por intenção de pagamento —
// nenhum adapter de gateway (packages/payments) cria uma segunda intenção para a mesma chave.
// `status` espelha `PaymentStatus` de packages/domain/src/payment/state-machine.ts (I2) — o banco
// não valida a transição (isso é o domínio), só persiste o estado corrente.
export const paymentIntents = pgTable("payment_intents", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  reservationId: uuid("reservation_id")
    .notNull()
    .references(() => reservations.id),
  gateway: text("gateway").notNull(), // 'asaas' | 'stripe'
  externalId: text("external_id"),
  status: text("status").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
