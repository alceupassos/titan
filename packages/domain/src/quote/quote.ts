// Cotação (seção 9.1 do prompt único): "nunca confiar no preço enviado pelo cliente" — toda
// cotação é calculada no servidor e devolvida com um TTL; o checkout consome só o `quote.id`,
// nunca um preço solto. Zero I/O: o "agora" e o `id` são injetados pelo chamador (borda de I/O
// em packages/db ou apps/worker), não lidos aqui — mesmo padrão de injeção de `HashFn` usado em
// packages/domain/src/evidence/chain.ts.
import type { Money } from "@titan/money";
import type { Stay } from "@titan/dates";
import { priceStay, type RatePlan } from "../rate-plan/rate-plan";

export interface Quote {
  readonly id: string;
  readonly unitId: string;
  readonly stay: Stay;
  readonly ratePlanId: string;
  readonly priceAmount: Money;
  readonly expiresAtEpochMs: number;
}

export interface CreateQuoteParams {
  readonly id: string;
  readonly unitId: string;
  readonly stay: Stay;
  readonly ratePlan: RatePlan;
  readonly nowEpochMs: number;
  readonly ttlMs: number;
}

/** Calcula o preço via `priceStay` (que já rejeita estadia mínima/fora de vigência) e empacota
 * como cotação com expiração. Lança os mesmos erros de `priceStay` — cotação nunca "esconde" uma
 * estadia inválida atrás de um preço qualquer. */
export function createQuote(params: CreateQuoteParams): Quote {
  const priceAmount = priceStay(params.ratePlan, params.stay);
  return {
    id: params.id,
    unitId: params.unitId,
    stay: params.stay,
    ratePlanId: params.ratePlan.id,
    priceAmount,
    expiresAtEpochMs: params.nowEpochMs + params.ttlMs,
  };
}

export function isQuoteExpired(quote: Quote, nowEpochMs: number): boolean {
  return nowEpochMs >= quote.expiresAtEpochMs;
}
