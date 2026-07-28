import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { workforceMembers } from "./workforce-member";

// Espelho de packages/domain/src/workforce/productivity.ts::TaskCompletionRecord. `taskId` é
// texto livre (referência a cleaning_tasks/work_orders sem FK obrigatória — mesmo espírito de
// `assigned_to` em cleaning-task.ts, já que o tipo de tarefa varia por bounded context).
export const taskCompletionRecords = pgTable("task_completion_records", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => workforceMembers.id),
  taskId: text("task_id").notNull(),
  evidenceHashes: jsonb("evidence_hashes").notNull(), // string[]
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
});
