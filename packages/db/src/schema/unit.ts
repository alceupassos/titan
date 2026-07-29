import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Tabela mínima de unidade — só o necessário para reservations/rate_plans terem uma FK real
// nesta fase. Inventário completo (propriedade, comodidades, mídia) é bounded context
// `inventory`, ainda não modelado; `status` já reflete a máquina de estados de I9
// (packages/domain/src/unit/state-machine.ts) por convenção de nome, não por CHECK constraint —
// a validação de transição fica no domínio, não no banco (a garantia de banco aqui é só a
// existência da unidade para efeito de FK).
//
// Planoexplica.md, "cadastrar unidade" — `areaSqm`/`maxCapacity`/`category` nullable de
// propósito: as 8 unidades seedadas antes desta migration nunca ganham um valor inventado. São
// os mesmos 3 campos que `apps/console/app/(staff)/unidades/sample-data.ts` (amostra) já
// modelava só na camada de UI, documentado ali como gap desde a Fase 8 — esta migration fecha
// esse gap para unidades CRIADAS a partir de agora, sem mexer no schema já usado pela amostra.
export const units = pgTable("units", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  status: text("status").notNull().default("ready"),
  areaSqm: integer("area_sqm"),
  maxCapacity: integer("max_capacity"),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
