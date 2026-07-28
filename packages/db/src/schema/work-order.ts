import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { units } from "./unit";
import { vendors } from "./vendor";

// Persiste WorkOrderStatus de packages/domain/src/work-order/state-machine.ts (FSM já existente
// desde a Fase 0 — reusada aqui, não recriada). Cobre OS técnica da tabela da seção 9.8.4
// (dedetização, ar-condicionado, manutenção corretiva etc.). `vendorId` nullable — nem toda OS
// tem prestador externo (equipe própria também abre OS).
export const workOrders = pgTable("work_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => units.id),
  serviceType: text("service_type").notNull(),
  vendorId: uuid("vendor_id").references(() => vendors.id),
  status: text("status").notNull().default("opened"),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
