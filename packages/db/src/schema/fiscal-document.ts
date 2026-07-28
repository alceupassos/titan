import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { reservations } from "./reservation";

// I7 — documento fiscal emitido não é editável, só cancelado/substituído. `naturalKey` é a âncora
// de idempotência forte (seção 9.6 do prompt único): persistida ANTES de qualquer chamada ao
// gateway (packages/fiscal), UNIQUE aqui garante que retry nunca produz duas notas para o mesmo
// fato gerador — a segunda tentativa encontra a linha já existente e não chama o provedor de novo.
// `status` é o status do PROCESSO de emissão (`pending|issued|rejected|cancelled|substituted` —
// packages/domain/src/fiscal/service-invoice.ts, InvoiceStatus), não o `FiscalDocumentStatus` de
// packages/domain/src/fiscal-document/state-machine.ts (esse último rege o documento já emitido;
// aqui só persistimos o texto do status, a máquina de estados vive no domínio).
// `xmlStorageRef`/`pdfStorageRef` são referências ao cofre WORM (packages/fiscal — FiscalVault),
// nunca o binário em si nesta tabela.
export const fiscalDocuments = pgTable("fiscal_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  reservationId: uuid("reservation_id")
    .notNull()
    .references(() => reservations.id),
  naturalKey: text("natural_key").notNull().unique(),
  municipalityCode: text("municipality_code").notNull(),
  serviceCode: text("service_code").notNull(),
  baseAmountCents: integer("base_amount_cents").notNull(),
  taxAmountCents: integer("tax_amount_cents").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("pending"),
  externalInvoiceId: text("external_invoice_id"),
  xmlStorageRef: text("xml_storage_ref"),
  pdfStorageRef: text("pdf_storage_ref"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
});
