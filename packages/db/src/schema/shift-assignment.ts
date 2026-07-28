import { date, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { workforceMembers } from "./workforce-member";

// Espelho de packages/domain/src/workforce/assignment.ts::ShiftAssignment. status inicial
// ('accepted' vs. 'proposed') é decidido pelo domínio via resolveAssignmentMode(employmentType) —
// esta tabela só persiste o resultado, nunca decide o modo por conta própria.
export const shiftAssignments = pgTable("shift_assignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => workforceMembers.id),
  date: date("date").notNull(),
  status: text("status").notNull().default("proposed"), // 'proposed'|'accepted'|'declined'|'completed'
});
