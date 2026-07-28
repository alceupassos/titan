// INSERT de reserva vinda de canal externo (Fase 3, Passo 5 — integração final,
// docs/fase-atual.md). Único pedaço genuinamente novo desta faixa — contas/lançamentos de ledger
// reusam `PaymentRepo.findOrCreateAccount`/`insertLedgerEntries` (payment-repo.ts, Fase 2, mesmo
// contrato exato) e divergências reusam `ChannelSyncRepo.insertDivergences`
// (channel-sync-repo.ts, Fase 3) — nenhuma lógica duplicada entre os três repos.
import { reservations, withTenant, type TenantContext } from "@titan/db";
import type { Cents } from "@titan/domain";

export interface ExternalReservationInsert {
  readonly unitId: string;
  readonly stayLiteral: string; // formato daterange "[YYYY-MM-DD,YYYY-MM-DD)"
  readonly channel: string;
  readonly externalRef: string;
  readonly priceCents: Cents;
  readonly currency: string;
}

export type ExternalReservationInsertOutcome =
  | { readonly kind: "created"; readonly reservationId: string }
  | { readonly kind: "exclusion_violation" }; // I1 — mesmo tratamento de 23P01 já usado no cockpit/storefront

export interface ExternalReservationRepo {
  /** INSERT real de reserva vinda de canal — status sempre `"pending"` (nunca `confirmed` direto:
   * mesma regra de `mapExternalReservationToDomain`, packages/domain/src/channel/external-reservation.ts).
   * A constraint `EXCLUDE USING gist` do banco é o árbitro final de I1, nunca um caminho separado
   * por canal — se violar, retorna `exclusion_violation` em vez de deixar o erro Postgres vazar
   * cru (mesmo padrão de `apps/console/.../reservas/nova/actions.ts` e
   * `apps/web/app/checkout/actions.ts`). */
  insertExternalReservation(ctx: TenantContext, input: ExternalReservationInsert): Promise<ExternalReservationInsertOutcome>;
}

const POSTGRES_EXCLUSION_VIOLATION = "23P01";

function isExclusionViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === POSTGRES_EXCLUSION_VIOLATION;
}

export function createDrizzleExternalReservationRepo(): ExternalReservationRepo {
  return {
    async insertExternalReservation(ctx, input) {
      try {
        return await withTenant(ctx, async (db) => {
          const [row] = await db
            .insert(reservations)
            .values({
              tenantId: ctx.tenantId,
              unitId: input.unitId,
              stay: input.stayLiteral,
              status: "pending",
              channel: input.channel,
              externalRef: input.externalRef,
              priceCents: input.priceCents,
              currency: input.currency,
            })
            .returning({ id: reservations.id });
          if (!row) {
            throw new Error("INSERT de reserva externa não retornou id.");
          }
          return { kind: "created", reservationId: row.id } as const;
        });
      } catch (err) {
        if (isExclusionViolation(err)) {
          return { kind: "exclusion_violation" };
        }
        throw err;
      }
    },
  };
}
