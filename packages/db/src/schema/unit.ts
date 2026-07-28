import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Tabela mínima de unidade — só o necessário para reservations/rate_plans terem uma FK real
// nesta fase. Inventário completo (propriedade, comodidades, mídia) é bounded context
// `inventory`, ainda não modelado; `status` já reflete a máquina de estados de I9
// (packages/domain/src/unit/state-machine.ts) por convenção de nome, não por CHECK constraint —
// a validação de transição fica no domínio, não no banco (a garantia de banco aqui é só a
// existência da unidade para efeito de FK).
export const units = pgTable("units", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("ready"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
