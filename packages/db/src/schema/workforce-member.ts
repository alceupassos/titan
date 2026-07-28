import { jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Fase 9 (Pessoas e Campo) — cadastro operacional da equipe de campo. `employmentType` inclui
// 'unspecified' porque a pergunta 3 de docs/decisoes-de-negocio.md (vínculo: CLT/PJ/terceirizada)
// segue pendente por decisão do usuário — packages/domain/src/workforce/assignment.ts trata esse
// valor como padrão conservador (escala nunca obrigatória sem vínculo confirmado). Nunca ponto
// oficial/folha (docs/adr/0011-ponto-eletronico-nao-construir.md) — só registro operacional.
export const workforceMembers = pgTable("workforce_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  fullName: text("full_name").notNull(),
  role: text("role").notNull(), // cargo — texto livre (camareira, manutenção, inspeção...)
  zones: jsonb("zones").notNull(), // string[] — bairros/regiões atendidas
  skills: jsonb("skills").notNull(), // string[]
  certifications: jsonb("certifications").notNull(), // string[] — sem motor de vencimento nesta fase
  employmentType: text("employment_type").notNull().default("unspecified"),
  status: text("status").notNull().default("active"), // 'active' | 'dismissed'
});
