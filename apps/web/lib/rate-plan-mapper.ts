// Conversão da linha crua do Drizzle (`packages/db/src/schema/rate-plan.ts`) para o agregado de
// domínio `RatePlan` (`packages/domain/src/rate-plan/rate-plan.ts`) — compartilhado entre
// `lib/queries.ts` (leitura pública) e `app/unidades/[id]/actions.ts` (cotação), mesmo padrão de
// `apps/console/app/(staff)/reservas/nova/actions.ts`.
import { civilDate } from "@titan/dates";
import type { CurrencyCode } from "@titan/money";
import type { RatePlan } from "@titan/domain";
import type { ratePlans } from "@titan/db";

export function asCurrencyCode(value: string): CurrencyCode {
  if (value === "BRL" || value === "USD" || value === "EUR") {
    return value;
  }
  throw new Error(`Moeda desconhecida no plano de tarifa: "${value}".`);
}

export function toDomainRatePlan(row: typeof ratePlans.$inferSelect): RatePlan {
  return {
    id: row.id,
    tenantId: row.tenantId,
    unitId: row.unitId,
    name: row.name,
    nightlyPrice: { amountCents: row.nightlyPriceCents, currency: asCurrencyCode(row.currency) },
    minStayNights: row.minStayNights,
    validFrom: civilDate(row.validFrom),
    validTo: civilDate(row.validTo),
  };
}
