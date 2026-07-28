import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Fila central de aprovações — seção 9.4.2 do prompt único. Só o suficiente para o tipo `refund`
// tem lógica de negócio real nesta fase (packages/domain/src/approval/); os outros 11 tipos
// documentados existem como valor válido de `type`, sem fluxo implementado ainda. "Nada de
// aprovação por chat" — esta tabela e a rota `(staff)/aprovacoes` são o único caminho de decisão.
export const approvalRequests = pgTable("approval_requests", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  type: text("type").notNull(),
  requestedBy: text("requested_by").notNull(), // id de usuário ou "agent:<nome> v<versão>"
  rationale: text("rationale").notNull(),
  impact: jsonb("impact").notNull(),
  risk: text("risk").notNull(), // 'low' | 'medium' | 'high'
  requiredApprovals: integer("required_approvals").notNull(),
  stepUpRequired: boolean("step_up_required").notNull(),
  status: text("status").notNull().default("pending"),
  slaAt: timestamp("sla_at", { withTimezone: true }).notNull(),
  // `packages/domain/src/approval/approval-state-machine.ts` (rejectApproval) exige comentário em
  // toda rejeição mas deixa "onde persistir" como decisão desta camada — aqui: `decisionComment`
  // guarda esse comentário (obrigatório para reject, opcional para approve), `decidedBy`/
  // `decidedAt` registram quem decidiu e quando. Nenhuma edição depois de decidido — é o próprio
  // `status` terminal (rejected/approved) que impede uma segunda decisão (regra de domínio).
  decisionComment: text("decision_comment"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
