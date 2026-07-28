import { date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";
import { vendors } from "./vendor";
import { approvalRequests } from "./approval-request";

// Contas a pagar mínimo (Fase 5, seção 9.5: "aprovação em duas etapas acima do limite" — reusa a
// fila central de approval_requests já existente desde a Fase 2, tipo 'purchase_order', em vez
// de um fluxo de aprovação próprio). Recorrência automática/anexos de comprovante ficam para
// quando houver um agendador de tarefas recorrentes real — fora do escopo desta fase.
export const accountsPayable = pgTable("accounts_payable", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  vendorId: uuid("vendor_id")
    .notNull()
    .references(() => vendors.id),
  unitId: uuid("unit_id").references(() => units.id), // nullable: despesa pode não ser de uma unidade específica
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"), // 'pending' | 'approved' | 'paid'
  dueDate: date("due_date").notNull(),
  approvalRequestId: uuid("approval_request_id").references(() => approvalRequests.id),
  // Fase 7 (Suprimentos e Prestadores) — snapshot de VendorRetentionAmounts no momento do
  // pagamento (inssCents/irrfCents/csrfCents/issCents/netCents), nullable até o pagamento ser
  // efetivado por payVendorInvoiceAction. Persistido como jsonb (não recalculado depois) porque é
  // o registro do que foi de fato retido naquele pagamento — a vendor_retention_rule vigente pode
  // mudar depois sem afetar pagamentos já feitos (mesmo espírito de checklist_template_version
  // fixada no momento da criação da tarefa de limpeza).
  retentionBreakdown: jsonb("retention_breakdown"),
});
