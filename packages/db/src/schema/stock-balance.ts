import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Nível de estoque materializado por unidade/item — atualizado na MESMA transação do INSERT em
// stock_movements pela Server Action (nunca por trigger de banco nesta fase, sem Docker/daemon
// real para testar trigger nesta sessão). Existe só como leitura rápida para o painel de
// /estoque; a fonte de verdade continua sendo o histórico completo de stock_movements —
// packages/domain/src/supply/stock.ts::reconstructStockLevel prova que os dois batem (portão de
// saída da fase: "saldo reconstruído bate com saldo materializado").
export const stockBalances = pgTable("stock_balances", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  itemType: text("item_type").notNull(),
  quantity: integer("quantity").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
