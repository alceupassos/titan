"use server";

// Server Actions do fluxo de nova reserva (Fase 1, Passo 5 — docs/fase-atual.md): cotação e
// confirmação. Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza (CASL)
// dentro dela mesma" — as duas ações abaixo fazem as duas coisas por conta própria, sem confiar
// em nenhuma checagem anterior (nem no `proxy.ts`, que só confere presença de cookie — ver
// apps/console/proxy.ts e apps/console/lib/auth/session.ts).
//
// O árbitro final de I1 ("uma unidade nunca tem duas reservas confirmadas com estadias
// sobrepostas") continua sendo a constraint `EXCLUDE USING gist` do banco
// (packages/db/migrations/0002_availability_rates_reservations.sql) — o pré-check em memória
// (`canAcceptReservation`, de @titan/domain) aqui é só otimização de UX/erro cedo, nunca a
// garantia. O INSERT real roda fora de qualquer try/catch de "erro de negócio esperado": se ele
// violar a constraint, o erro sobe (via `withTenant`, que faz ROLLBACK e relança) até o catch
// externo desta função, que traduz especificamente o código Postgres `23P01` — a MESMA constante
// usada em packages/db/test/reservation-concurrency.test.ts para confirmar como o erro chega via
// `pg`/Drizzle.
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import {
  CreateReservationSchema,
  QuoteRequestSchema,
  type QuoteResponse,
} from "@titan/contracts";
import {
  canAcceptReservation,
  createQuote,
  priceStay,
  type RatePlan,
  type ReservationForOverlapCheck,
  type ReservationStatus,
} from "@titan/domain";
import { civilDate, stay, type Stay } from "@titan/dates";
import type { CurrencyCode } from "@titan/money";
import { ratePlans, reservations, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

const QUOTE_TTL_MS = 15 * 60 * 1000; // 15 minutos — TTL da cotação exibida ao usuário.

// Código de erro do Postgres para violação de constraint EXCLUDE — mesma constante usada em
// packages/db/test/reservation-concurrency.test.ts.
const POSTGRES_EXCLUSION_VIOLATION = "23P01";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Formato inverso de `daterangeLiteral` (packages/db/seed/index.ts) — não importado do seed
 * (não é dependência declarada deste app; a lógica é trivial o bastante para replicar aqui, como
 * já orientado). Postgres CANONICALIZA `daterange` (tipo discreto) para a forma "[lower,upper)"
 * em toda leitura, independentemente de como a linha foi inserida — então este parser simples é
 * seguro para qualquer linha vinda do banco, não só as escritas por esta própria Server Action. */
function parseDaterangeLiteral(literal: string): Stay {
  const match = /^\[([^,]+),([^)]+)\)$/.exec(literal);
  if (!match) {
    throw new Error(`daterange em formato inesperado: "${literal}".`);
  }
  const [, checkinISO, checkoutISO] = match;
  return stay(checkinISO!, checkoutISO!);
}

function daterangeLiteral(checkinISO: string, checkoutISO: string): string {
  return `[${checkinISO},${checkoutISO})`;
}

function asCurrencyCode(value: string): CurrencyCode {
  if (value === "BRL" || value === "USD" || value === "EUR") {
    return value;
  }
  throw new Error(`Moeda desconhecida no plano de tarifa: "${value}".`);
}

/** Converte a linha crua do Drizzle (`packages/db/src/schema/rate-plan.ts`) para o agregado de
 * domínio `RatePlan` (`packages/domain/src/rate-plan/rate-plan.ts`) — conversão de tipos:
 * `nightlyPriceCents` (integer) -> `Money`, `validFrom`/`validTo` (coluna `date`, string
 * "YYYY-MM-DD") -> `CivilDate`. */
function toDomainRatePlan(row: typeof ratePlans.$inferSelect): RatePlan {
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

function isExclusionViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_EXCLUSION_VIOLATION
  );
}

/** Erros de sessão/tenant e de domínio (MinStayViolationError, RatePlanNotValidForStayError, ou
 * qualquer `Error` de validação) já chegam com mensagem pt-BR pronta para exibição — nunca
 * deixamos uma exceção não tratada vazar para o cliente (o cliente só vê `ActionResult`). */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
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

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  // Cotar é leitura de tarifa — a ability `read`/`reservation` já concedida a `titan.operations`
  // desde a Fase 0 é suficiente; a permissão de `create` (recém-adicionada em
  // packages/auth/src/abilities.ts) só é exigida para CONFIRMAR (`createReservationAction`).
  if (session.ability.cannot("read", "reservation")) {
    return { ok: false, error: "Sem permissão para cotar reserva com o papel atual." };
  }

  let stayValue: Stay;
  try {
    stayValue = stay(request.checkinISO, request.checkoutISO);
  } catch (err) {
    return toActionError(err, "Estadia inválida.");
  }

  try {
    const quote = await withTenant({ tenantId: session.tenantId, actorId: session.userId }, async (db) => {
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

type ReservationInsertOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "created"; reservationId: string };

export async function createReservationAction(input: unknown): Promise<ActionResult<{ reservationId: string }>> {
  const parsed = CreateReservationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("create", "reservation")) {
    return { ok: false, error: "Sem permissão para criar reserva com o papel atual." };
  }

  let stayValue: Stay;
  try {
    stayValue = stay(request.checkinISO, request.checkoutISO);
  } catch (err) {
    return toActionError(err, "Estadia inválida.");
  }

  try {
    const outcome = await withTenant<ReservationInsertOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [ratePlanRow] = await db.select().from(ratePlans).where(eq(ratePlans.id, request.ratePlanId));
        if (!ratePlanRow) {
          return { kind: "business-error", error: "Plano de tarifa não encontrado." };
        }
        if (ratePlanRow.unitId !== request.unitId) {
          return { kind: "business-error", error: "Plano de tarifa não pertence à unidade informada." };
        }

        const ratePlan = toDomainRatePlan(ratePlanRow);
        // Preço RECALCULADO aqui, nunca aceito do cliente (nem o `quoteId` é usado como chave de
        // lookup — ver nota em packages/contracts/src/reservation.ts). Pode lançar
        // `MinStayViolationError`/`RatePlanNotValidForStayError`, propositalmente não capturado
        // aqui — sobe para o catch externo, que já sabe extrair `.message` de qualquer `Error`.
        const priceAmount = priceStay(ratePlan, stayValue);

        // Pré-check em memória de I1 (nunca o árbitro final — ver cabeçalho do arquivo).
        const activeRows = await db
          .select({ id: reservations.id, stay: reservations.stay, status: reservations.status })
          .from(reservations)
          .where(
            and(eq(reservations.unitId, request.unitId), inArray(reservations.status, ["pending", "confirmed"])),
          );

        const existing: ReservationForOverlapCheck[] = activeRows.map((row) => ({
          unitId: request.unitId,
          stay: parseDaterangeLiteral(row.stay),
          status: row.status as ReservationStatus,
        }));

        if (!canAcceptReservation({ unitId: request.unitId, stay: stayValue }, existing)) {
          return { kind: "business-error", error: "Esta unidade já tem uma reserva para este período." };
        }

        // INSERT real, fora de qualquer try/catch de "erro de negócio esperado" — ver nota no
        // cabeçalho do arquivo sobre por que a violação da constraint EXCLUDE deve subir até o
        // catch externo em vez de ser engolida aqui dentro.
        const [row] = await db
          .insert(reservations)
          .values({
            tenantId: session.tenantId,
            unitId: request.unitId,
            stay: daterangeLiteral(request.checkinISO, request.checkoutISO),
            status: "pending",
            channel: request.channel,
            priceCents: priceAmount.amountCents,
            currency: priceAmount.currency,
            guestCount: request.guestCount ?? null,
          })
          .returning({ id: reservations.id });

        if (!row) {
          throw new Error("INSERT de reserva não retornou id.");
        }

        return { kind: "created", reservationId: row.id };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { reservationId: outcome.reservationId } };
  } catch (err) {
    if (isExclusionViolation(err)) {
      return { ok: false, error: "Esta unidade já tem uma reserva para este período." };
    }
    return toActionError(err, "Falha ao criar reserva.");
  }
}
