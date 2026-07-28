import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Fornecedor mínimo (Fase 5, AP/AR — seção 9.5 do prompt único: "fornecedores — lavanderia,
// camareira, manutenção, condomínio, IPTU, energia, internet"). Cadastro completo
// (certidões/compliance/scorecard) é bounded context `vendors`, Fase 7 — aqui só o mínimo para
// `accounts_payable` ter uma referência real.
export const vendors = pgTable("vendors", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  document: text("document").notNull(), // CPF/CNPJ
  category: text("category").notNull(), // 'lavanderia' | 'manutencao' | 'condominio' | ...
});
