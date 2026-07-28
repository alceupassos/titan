// Leituras públicas do storefront (Fase 2, Passo 4c). Diferente das Server Actions de
// `unidades/[id]/actions.ts` e `checkout/actions.ts` (mutações/cotação, chamadas do cliente), as
// funções aqui são consumidas diretamente por Server Components (`page.tsx`) via fetch de dados
// no próprio render — não há CASL a checar (leitura pública de unidade/tarifa, sem dado
// sensível), só o mesmo `withTenant()` de sempre para respeitar RLS multi-tenant.
import { desc, eq, inArray } from "drizzle-orm";
import { paymentIntents, units, ratePlans, reservations, withTenant } from "@titan/db";
import { civilDate } from "@titan/dates";
import type { CurrencyCode, Money } from "@titan/money";
import { ratePlanCoversStay, type RatePlan } from "@titan/domain";
import { resolveStorefrontTenantId, STOREFRONT_ACTOR_ID } from "./tenant";
import { asCurrencyCode, toDomainRatePlan } from "./rate-plan-mapper";

export interface UnitSummary {
  readonly id: string;
  readonly name: string;
  /** Menor diária entre os planos de tarifa da unidade — rótulo "a partir de", não o preço final
   * de nenhuma estadia específica (o preço final é sempre recalculado por `createQuoteAction`
   * para as datas escolhidas). */
  readonly fromNightlyPrice: Money | null;
}

/** Lista unidades no estado `ready` (I9 — só unidade pronta é ofertada no canal direto; unidade
 * `dirty`/`blocked`/`occupied` não aparece aqui). Não filtra por data ainda nesta fase (checar
 * sobreposição de estadia por unidade exigiria repetir a mesma lógica de
 * `canAcceptReservation`/EXCLUDE do cockpit para uma lista inteira — fora do escopo mínimo do
 * portão de saída da Fase 2; a checagem real acontece na cotação/confirmação da unidade
 * individual, que é onde I1 precisa valer de verdade). */
export async function listAvailableUnits(): Promise<UnitSummary[]> {
  const tenantId = resolveStorefrontTenantId();
  return withTenant({ tenantId, actorId: STOREFRONT_ACTOR_ID }, async (db) => {
    const unitRows = await db.select().from(units).where(eq(units.status, "ready"));
    if (unitRows.length === 0) {
      return [];
    }

    const unitIds = unitRows.map((u) => u.id);
    const ratePlanRows = await db.select().from(ratePlans).where(inArray(ratePlans.unitId, unitIds));

    return unitRows.map((unit) => {
      const plansForUnit = ratePlanRows.filter((rp) => rp.unitId === unit.id);
      const cheapest = plansForUnit.reduce<(typeof ratePlanRows)[number] | null>((min, rp) => {
        if (!min || rp.nightlyPriceCents < min.nightlyPriceCents) return rp;
        return min;
      }, null);
      return {
        id: unit.id,
        name: unit.name,
        fromNightlyPrice: cheapest
          ? { amountCents: cheapest.nightlyPriceCents, currency: asCurrencyCode(cheapest.currency) }
          : null,
      };
    });
  });
}

export interface UnitDetail {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly ratePlans: readonly RatePlan[];
}

/** Detalhe de uma unidade + todos os seus planos de tarifa (ainda sem filtro de vigência — o
 * formulário de cotação da página de detalhe escolhe entre eles pelas datas informadas, via
 * `ratePlanCoversStay`). Retorna `null` se a unidade não existe neste tenant — a página chama
 * `notFound()` do Next nesse caso. */
export async function getUnitDetail(unitId: string): Promise<UnitDetail | null> {
  const tenantId = resolveStorefrontTenantId();
  return withTenant({ tenantId, actorId: STOREFRONT_ACTOR_ID }, async (db) => {
    const [unitRow] = await db.select().from(units).where(eq(units.id, unitId));
    if (!unitRow) {
      return null;
    }
    const ratePlanRows = await db.select().from(ratePlans).where(eq(ratePlans.unitId, unitId));
    return {
      id: unitRow.id,
      name: unitRow.name,
      status: unitRow.status,
      ratePlans: ratePlanRows.map(toDomainRatePlan),
    };
  });
}

/** Escolhe, entre os planos de uma unidade, o mais barato que cobre a estadia informada
 * (`ratePlanCoversStay`, @titan/domain) — mesma regra usada para exibir "qual tarifa se aplica"
 * antes mesmo de cotar; a cotação real (`createQuoteAction`) ainda recalcula tudo server-side. */
export function pickRatePlanForStay(
  ratePlans: readonly RatePlan[],
  stay: { checkin: string; checkout: string },
): RatePlan | null {
  const covering = ratePlans.filter((rp) =>
    ratePlanCoversStay(rp, { checkin: civilDate(stay.checkin), checkout: civilDate(stay.checkout) }),
  );
  if (covering.length === 0) {
    return null;
  }
  return covering.reduce((cheapest, rp) =>
    rp.nightlyPrice.amountCents < cheapest.nightlyPrice.amountCents ? rp : cheapest,
  );
}

export interface ReservationSummary {
  readonly id: string;
  readonly unitId: string;
  readonly unitName: string | null;
  readonly status: string;
  readonly channel: string;
  readonly priceAmount: Money;
  readonly stayLiteral: string;
  /** `null` quando o gateway não estava configurado no momento do checkout (ver
   * apps/web/lib/payment-gateway.ts) — a reserva continua válida, só sem intenção de pagamento
   * associada ainda. Confirmação de verdade (captured) só chega via webhook (apps/worker). */
  readonly paymentIntentStatus: string | null;
}

function parseDaterangeLiteral(literal: string): { checkin: string; checkout: string } {
  const match = /^\[([^,]+),([^)]+)\)$/.exec(literal);
  if (!match) {
    throw new Error(`daterange em formato inesperado: "${literal}".`);
  }
  const [, checkinISO, checkoutISO] = match;
  return { checkin: checkinISO!, checkout: checkoutISO! };
}

/** Leitura da página de confirmação pós-checkout. Retorna `null` se a reserva não existe neste
 * tenant (a página chama `notFound()`) — nunca vaza reserva de outro tenant graças a RLS +
 * `withTenant`. */
export async function getReservationById(reservationId: string): Promise<ReservationSummary | null> {
  const tenantId = resolveStorefrontTenantId();
  return withTenant({ tenantId, actorId: STOREFRONT_ACTOR_ID }, async (db) => {
    const [row] = await db.select().from(reservations).where(eq(reservations.id, reservationId));
    if (!row) {
      return null;
    }
    const [unitRow] = await db.select().from(units).where(eq(units.id, row.unitId));
    const { checkin, checkout } = parseDaterangeLiteral(row.stay);
    const [latestIntent] = await db
      .select({ status: paymentIntents.status })
      .from(paymentIntents)
      .where(eq(paymentIntents.reservationId, row.id))
      .orderBy(desc(paymentIntents.createdAt))
      .limit(1);
    return {
      id: row.id,
      unitId: row.unitId,
      unitName: unitRow?.name ?? null,
      status: row.status,
      channel: row.channel,
      priceAmount: { amountCents: row.priceCents, currency: asCurrencyCode(row.currency) },
      stayLiteral: `${checkin} → ${checkout}`,
      paymentIntentStatus: latestIntent?.status ?? null,
    };
  });
}
