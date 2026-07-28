import { date, integer, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// Regra dura do CLAUDE.md: "Alíquota, código de serviço, retenção e prazo de canal: tabela
// versionada. Nunca código." Espelho no banco de packages/domain/src/fiscal/tax-rule.ts —
// aliquotBasisPoints é inteiro (pontos-base, ex. 500 = 5,00%), nunca float. `validFrom`/
// `validTo` — nenhuma regra sobreposta para o mesmo município+serviço é aceita (checagem hoje só
// em domínio, `resolveTaxRuleForDate`; um EXCLUDE USING gist sobre daterange(valid_from,valid_to)
// seria o reforço de banco equivalente ao I1 das reservas, mas fica como dívida técnica desta
// fase — ver docs/fase-atual.md).
export const taxRules = pgTable("tax_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  municipalityCode: text("municipality_code").notNull(),
  serviceCode: text("service_code").notNull(),
  aliquotBasisPoints: integer("aliquot_basis_points").notNull(),
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to").notNull(),
});
