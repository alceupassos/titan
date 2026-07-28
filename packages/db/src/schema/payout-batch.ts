import { date, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";
import { approvalRequests } from "./approval-request";

// Lote de repasse ao proprietário (Fase 5 — seção 9.4.1 do prompt único, Camada 2: "quem cria o
// lote não aprova"). O CHECK abaixo (payout_batches_maker_checker) é a Camada 2 LITERAL aplicada
// como constraint de banco, não só disciplina de código — mesmo texto do exemplo SQL da spec:
// "ALTER TABLE payout_batches ADD CONSTRAINT maker_checker CHECK (approved_by IS NULL OR
// approved_by <> created_by)". Acima de R$ 5.000 (docs/decisoes-de-negocio.md pergunta 5), o
// worker/cockpit abre um approval_requests do tipo 'payout_batch' com requiredApprovals=2 e
// stepUpRequired=true (Camada 3) — o vínculo é por `approvalRequestId`, nunca um segundo caminho
// de aprovação paralelo.
// Nota: a CHECK de maker-checker (Camada 2) é declarada só na migration SQL crua
// (0006_financeiro.sql), mesmo padrão já usado para as CHECKs de outras tabelas neste pacote
// (ex. reservations_stay_not_empty, fiscal_documents_status_check) — o schema Drizzle aqui é só
// para tipagem/query building, nunca a fonte de verdade da constraint.
export const payoutBatches = pgTable("payout_batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  grossAmountCents: integer("gross_amount_cents").notNull(),
  commissionAmountCents: integer("commission_amount_cents").notNull(),
  expensesAmountCents: integer("expenses_amount_cents").notNull(),
  netAmountCents: integer("net_amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("draft"), // 'draft'|'pending_approval'|'approved'|'sent'|'failed'
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by"),
  approvalRequestId: uuid("approval_request_id").references(() => approvalRequests.id),
});
