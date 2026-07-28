"use server";

// Checkout do storefront (Fase 2, Passo 4c — docs/fase-atual.md). Valida com Zod
// (`CheckoutRequestSchema`, @titan/contracts) e cria a reserva `pending` com o MESMO tratamento
// de concorrência já usado no cockpit (`apps/console/app/(staff)/reservas/nova/actions.ts`):
// preço RECALCULADO server-side (nunca aceito do cliente/quote), pré-check em memória de I1
// (`canAcceptReservation`) e o INSERT real fora de qualquer catch de "erro esperado" — se a
// constraint EXCLUDE USING gist do banco disparar, o erro sobe até o catch externo, que traduz
// especificamente `23P01`.
//
// Autorização: mesma decisão documentada em `app/unidades/[id]/actions.ts` — não há papel Titan
// (CASL) para um hóspede anônimo comprando uma unidade pública; a garantia real (nunca confiar em
// preço do cliente, nunca deixar reserva sobrepor) continua vindo do domínio + banco, não de uma
// checagem de ability.
//
// Passo 6 (integração final — docs/fase-atual.md): depois que a reserva `pending` é criada,
// esta action cria o `payment_intent` de verdade via o adapter do gateway correspondente ao
// método escolhido (PIX -> Asaas, cartão -> Stripe — roteamento simples por método nesta fase,
// não o roteador declarativo completo de custo/aprovação da seção 9.3, que é fase futura). A
// CONFIRMAÇÃO da reserva (pending -> confirmed) nunca acontece aqui, síncrona — só chega via
// webhook processado por `apps/worker` (Passo 5), quando o gateway avisar que o pagamento foi
// capturado. Esta action só AUTORIZA/CRIA a intenção; nunca finge que o dinheiro já entrou.
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { CheckoutRequestSchema } from "@titan/contracts";
import { canAcceptReservation, priceStay, type ReservationForOverlapCheck, type ReservationStatus } from "@titan/domain";
import { stay, type Stay } from "@titan/dates";
import { paymentIntents, ratePlans, reservations, withTenant } from "@titan/db";
import type { Cents, GatewayIntent, PaymentGatewayAdapter } from "@titan/payments";
import { resolveStorefrontTenantId, STOREFRONT_ACTOR_ID, StorefrontTenantNotConfiguredError } from "@/lib/tenant";
import { toDomainRatePlan } from "@/lib/rate-plan-mapper";
import { resolveGatewayAdapter, GatewayNotConfiguredError } from "@/lib/payment-gateway";

const POSTGRES_EXCLUSION_VIOLATION = "23P01";

export type CheckoutActionResult =
  | {
      ok: true;
      data: {
        reservationId: string;
        paymentStatus: "created" | "authorized" | "pending_integration";
      };
    }
  | { ok: false; error: string };

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

function isExclusionViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === POSTGRES_EXCLUSION_VIOLATION
  );
}

function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof StorefrontTenantNotConfiguredError || err instanceof GatewayNotConfiguredError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

/** Cria o `payment_intent` no gateway e persiste a linha correspondente — chamado DEPOIS que a
 * reserva `pending` já existe (fora da transação de INSERT da reserva: uma chamada de rede a um
 * gateway externo nunca deve rodar dentro de uma transação de banco aberta). Se o gateway não
 * estiver configurado nesta máquina (sem credenciais reais — ver docs/runbook-pagamentos.md), a
 * reserva `pending` já criada continua válida e é reportada como `pending_integration`, nunca um
 * erro que desfaz a reserva. */
async function createPaymentIntentForReservation(params: {
  tenantId: string;
  reservationId: string;
  amountCents: Cents;
  currency: "BRL" | "USD" | "EUR";
  method: "pix" | "card";
}): Promise<{ paymentStatus: "created" | "authorized" | "pending_integration" }> {
  let adapter: PaymentGatewayAdapter;
  let gateway: "asaas" | "stripe";
  try {
    const resolved = resolveGatewayAdapter(params.method);
    adapter = resolved.adapter;
    gateway = resolved.gateway;
  } catch (err) {
    if (err instanceof GatewayNotConfiguredError) {
      // Sem credenciais reais nesta máquina (docs/runbook-pagamentos.md) — a reserva `pending`
      // continua de pé, só sem intenção de pagamento associada ainda.
      return { paymentStatus: "pending_integration" };
    }
    throw err;
  }

  const idempotencyKey = `checkout:${params.reservationId}`;
  let intent: GatewayIntent;
  try {
    intent = await adapter.createIntent({
      idempotencyKey,
      amountCents: params.amountCents,
      currency: params.currency,
      reservationId: params.reservationId,
      method: params.method,
    });
  } catch (err) {
    // Falha de rede/API do gateway não desfaz a reserva `pending` (ela já está commitada) — só
    // reporta como pendente de integração; o hóspede pode tentar o pagamento novamente depois.
    // eslint-disable-next-line no-console -- log mínimo, sem PAN/PII (I4).
    console.error(`[checkout] falha ao criar payment_intent no gateway ${gateway}:`, err);
    return { paymentStatus: "pending_integration" };
  }

  await withTenant({ tenantId: params.tenantId, actorId: STOREFRONT_ACTOR_ID }, async (db) => {
    await db.insert(paymentIntents).values({
      tenantId: params.tenantId,
      reservationId: params.reservationId,
      gateway,
      externalId: intent.externalId,
      status: intent.status,
      idempotencyKey,
      amountCents: params.amountCents,
      currency: params.currency,
    });
  });

  const status = intent.status === "captured" ? "authorized" : intent.status;
  return { paymentStatus: status === "authorized" || status === "created" ? status : "pending_integration" };
}

type ReservationInsertOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "created"; reservationId: string; amountCents: Cents; currency: "BRL" | "USD" | "EUR" };

export async function createCheckoutAction(input: unknown): Promise<CheckoutActionResult> {
  const parsed = CheckoutRequestSchema.safeParse(input);
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
    const outcome = await withTenant<ReservationInsertOutcome>(
      { tenantId, actorId: STOREFRONT_ACTOR_ID },
      async (db) => {
        const [ratePlanRow] = await db.select().from(ratePlans).where(eq(ratePlans.id, request.ratePlanId));
        if (!ratePlanRow) {
          return { kind: "business-error", error: "Plano de tarifa não encontrado." };
        }
        if (ratePlanRow.unitId !== request.unitId) {
          return { kind: "business-error", error: "Plano de tarifa não pertence à unidade informada." };
        }

        const ratePlan = toDomainRatePlan(ratePlanRow);
        // Preço RECALCULADO aqui, nunca aceito do cliente/quote — mesma disciplina do cockpit.
        // Pode lançar MinStayViolationError/RatePlanNotValidForStayError, propositalmente não
        // capturado aqui — sobe para o catch externo.
        const priceAmount = priceStay(ratePlan, stayValue);

        // Pré-check em memória de I1 (nunca o árbitro final — a constraint EXCLUDE do banco é).
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

        // INSERT real, fora de qualquer catch de "erro de negócio esperado" — mesma nota do
        // cockpit sobre por que a violação da constraint EXCLUDE deve subir até o catch externo.
        // Canal sempre "direct" — este é o storefront direto, não um adapter de OTA.
        const [row] = await db
          .insert(reservations)
          .values({
            tenantId,
            unitId: request.unitId,
            stay: daterangeLiteral(request.checkinISO, request.checkoutISO),
            status: "pending",
            channel: "direct",
            priceCents: priceAmount.amountCents,
            currency: priceAmount.currency,
          })
          .returning({ id: reservations.id });

        if (!row) {
          throw new Error("INSERT de reserva não retornou id.");
        }

        // Dados do hóspede (request.guest) ainda não têm onde persistir nesta fase —
        // `reservations` não tem coluna de hóspede (bounded context `crm`, fora do escopo desta
        // faixa: packages/db não pode ser editado aqui). Fica só como entrada validada por esta
        // Server Action; quando `packages/crm` existir, a reserva `pending` já criada aqui é o
        // ponto de ancoragem para associar o hóspede.
        return {
          kind: "created",
          reservationId: row.id,
          amountCents: priceAmount.amountCents,
          currency: priceAmount.currency,
        };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }

    // Chamada de rede ao gateway roda FORA da transação de banco acima (já commitada) — nunca
    // dentro de um `withTenant` aberto. Falha aqui nunca desfaz a reserva `pending` já criada.
    const { paymentStatus } = await createPaymentIntentForReservation({
      tenantId,
      reservationId: outcome.reservationId,
      amountCents: outcome.amountCents,
      currency: outcome.currency,
      method: request.paymentMethod,
    });

    return { ok: true, data: { reservationId: outcome.reservationId, paymentStatus } };
  } catch (err) {
    if (isExclusionViolation(err)) {
      return { ok: false, error: "Esta unidade já tem uma reserva para este período." };
    }
    return toActionError(err, "Falha ao criar reserva.");
  }
}
