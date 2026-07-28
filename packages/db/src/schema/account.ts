import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Plano de contas mínimo da Fase 2 ("ledger básico") — seção 9.5 do prompt único documenta o
// plano completo (receita de hospedagem, taxa de limpeza, comissão de canal, repasse, caução
// etc.); só as contas necessárias para o fluxo reserva→pagamento entram nesta fase, as demais
// nascem quando o financeiro completo (Fase 5) precisar delas.
export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  code: text("code").notNull(),
  name: text("name").notNull(),
  kind: text("kind").notNull(), // 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
});
