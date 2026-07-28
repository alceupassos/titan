import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";
import { workforceMembers } from "./workforce-member";

// Espelho de packages/domain/src/workforce/access-custody.ts::AccessCredentialEvent — append-only
// real, mesmo padrão já usado em outras tabelas de auditoria sensível deste monorepo (só
// SELECT+INSERT concedido, nenhuma escrita mutável posterior liberada). Prova o portão de saída
// "revogação de desligamento provada" — dismissMember() grava um evento 'revoked' aqui para cada
// credencial ativa, na mesma transação do desligamento.
export const accessCredentialEvents = pgTable("access_credential_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  entryHash: text("entry_hash").notNull().unique(),
  prevHash: text("prev_hash"),
  kind: text("kind").notNull(), // 'issued' | 'transferred' | 'revoked'
  memberId: uuid("member_id")
    .notNull()
    .references(() => workforceMembers.id),
  credentialType: text("credential_type").notNull(), // 'physical_key' | 'digital_code' | 'app_access'
  credentialId: text("credential_id").notNull(),
  reason: text("reason"),
  envelope: jsonb("envelope"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
