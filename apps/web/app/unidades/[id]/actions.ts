"use server";

// Cotação server-side do storefront (Fase 2, Passo 4c — docs/fase-atual.md). Mesmo espírito de
// `apps/console/app/(staff)/reservas/nova/actions.ts::createQuoteAction`: "Toda Server Action
// valida (Zod)" continua valendo aqui — mas a metade "e autoriza (CASL)" da regra dura do
// CLAUDE.md raiz é uma checagem de PAPEL TITAN (staff/proprietário), que não existe para um
// hóspede anônimo cotando uma unidade pública. Ver `packages/auth/src/abilities.ts`: as abilities
// definidas ali são só para os papéis `titan.*`, nenhum deles "guest" — não existe ability para
// pular. Decisão explícita desta faixa: cotar/ler unidade pública dispensa autorização CASL de
// propósito (é leitura pública por definição, como um preço numa vitrine de loja), e isso fica
// documentado aqui em vez de forjar uma checagem que não faz sentido de domínio. O que a
// invariante I8 ("preço publicado deriva de decisão de pricing rastreável") exige de verdade —
// preço nunca calculado no cliente — continua garantido: `createQuote`/`priceStay` rodam aqui,
// dentro da Server Action, com o plano de tarifa lido do banco, nunca aceito do formulário.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { QuoteRequestSchema, type QuoteResponse } from "@titan/contracts";
import { createQuote } from "@titan/domain";
import { stay, type Stay } from "@titan/dates";
import { ratePlans, withTenant } from "@titan/db";
import { resolveStorefrontTenantId, STOREFRONT_ACTOR_ID, StorefrontTenantNotConfiguredError } from "@/lib/tenant";
import { toDomainRatePlan } from "@/lib/rate-plan-mapper";

const QUOTE_TTL_MS = 15 * 60 * 1000; // 15 minutos — mesmo TTL do cockpit.

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof StorefrontTenantNotConfiguredError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

export async function createQuoteAction(input: unknown): Promise<ActionResult<QuoteResponse>> {
  const parsed = QuoteRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let stayValue: Stay;
  try {
    stayValue = stay(request.checkinISO, request.checkoutISO);
  } catch (err) {
    return toActionError(err, "Estadia inválida.");
  }

  let tenantId: string;
  try {
    tenantId = resolveStorefrontTenantId();
  } catch (err) {
    return toActionError(err, "Storefront sem tenant configurado.");
  }

  try {
    const quote = await withTenant({ tenantId, actorId: STOREFRONT_ACTOR_ID }, async (db) => {
      const [ratePlanRow] = await db.select().from(ratePlans).where(eq(ratePlans.id, request.ratePlanId));
      if (!ratePlanRow) {
        throw new Error("Plano de tarifa não encontrado.");
      }
      if (ratePlanRow.unitId !== request.unitId) {
        throw new Error("Plano de tarifa não pertence à unidade informada.");
      }

      const ratePlan = toDomainRatePlan(ratePlanRow);
      return createQuote({
        id: randomUUID(),
        unitId: request.unitId,
        stay: stayValue,
        ratePlan,
        nowEpochMs: Date.now(),
        ttlMs: QUOTE_TTL_MS,
      });
    });

    const response: QuoteResponse = {
      id: quote.id,
      unitId: quote.unitId,
      stay: { checkin: quote.stay.checkin, checkout: quote.stay.checkout },
      ratePlanId: quote.ratePlanId,
      priceAmount: quote.priceAmount,
      expiresAtEpochMs: quote.expiresAtEpochMs,
    };
    return { ok: true, data: response };
  } catch (err) {
    return toActionError(err, "Falha ao calcular cotação.");
  }
}
