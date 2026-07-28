import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";
import { checklistTemplates } from "./checklist-template";

// Tarefa de virada (limpeza) — a fonte de verdade do estado da UNIDADE continua sendo
// `units.status` (I9, packages/domain/src/unit/state-machine.ts). Esta tabela só persiste QUEM
// está executando a virada e o checklist/score associado — nunca uma máquina de estados
// paralela. `assignedTo` é texto livre (sem vínculo formal — pergunta 3 de
// docs/decisoes-de-negocio.md segue pendente por decisão do usuário; nenhum bounded context
// `workforce`/employee/contractor é modelado nesta fase).
export const cleaningTasks = pgTable("cleaning_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  checklistTemplateId: uuid("checklist_template_id")
    .notNull()
    .references(() => checklistTemplates.id),
  checklistTemplateVersion: integer("checklist_template_version").notNull(),
  assignedTo: text("assigned_to").notNull(),
  status: text("status").notNull().default("cleaning"), // 'cleaning'|'clean'|'inspected'|'rework'
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  scorePercent: integer("score_percent"),
  passed: boolean("passed"),
});
