import { date, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";

// Contrato de administração (Fase 5, docs/decisoes-de-negocio.md pergunta 4): comissão sempre
// percentual fixo sobre receita BRUTA (commissionBasisPoints, inteiro — nunca float, mesmo
// espírito de aliquotBasisPoints em packages/db/src/schema/tax-rule.ts). itemPaymentModel é
// CONFIGURÁVEL POR CONTRATO (nunca uma constante global de código) — cada proprietário/unidade
// escolhe entre "titan_pays_all" (limpeza/enxoval/manutenção/amenities embutidos na comissão) e
// "owner_pays_itemized" (proprietário paga, Titan rateia e desconta do repasse).
export const administrationContracts = pgTable("administration_contracts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  commissionBasisPoints: integer("commission_basis_points").notNull(),
  itemPaymentModel: text("item_payment_model").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
});
