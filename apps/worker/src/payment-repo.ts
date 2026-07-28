// Operações tenant-scoped do processamento de webhook — TODAS via `withTenant()` (nunca a
// conexão admin de `admin-db.ts`, que só existe para resolver o tenant de um evento externo).
// Extraído como interface própria (`PaymentRepo`) em vez de expor `TenantDb`/drizzle cru direto
// ao job (`jobs/process-webhook.ts`): permite testar a lógica de transição/postagem de ledger com
// um fake plano (funções simples, sem simular a API encadeada do query builder do drizzle) — mesmo
// espírito de injeção de dependência do `fetchFn` do adapter Asaas.
import { and, eq } from "drizzle-orm";
import { accounts, ledgerEntries, paymentIntents, reservations, withTenant, type TenantContext } from "@titan/db";
import type { Cents, LedgerEntry } from "@titan/domain";

export interface PaymentIntentFullRow {
  readonly id: string;
  readonly tenantId: string;
  readonly reservationId: string;
  readonly gateway: string;
  readonly externalId: string | null;
  readonly status: string;
  // Cents (alias de `number`, ver packages/domain/src/ledger/ledger-entry.ts) — não é `number`
  // cru: docs/anti-padroes.md #9 / hook `block-money-float.mjs`.
  readonly amountCents: Cents;
  readonly currency: string;
}

export type AccountKind = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface PaymentRepo {
  /** Busca o payment_intent completo, JÁ sob `withTenant()` (RLS real) — fonte de verdade do
   * processamento; o lookup em `admin-db.ts` serve só para aprender o `tenantId`. */
  getPaymentIntentById(ctx: TenantContext, id: string): Promise<PaymentIntentFullRow | undefined>;
  updatePaymentIntentStatus(ctx: TenantContext, id: string, status: string): Promise<void>;
  /** Busca a conta do plano de contas por `code`; cria na hora se não existir. Suficiente para o
   * mínimo funcional desta fase (I2/captured) — sem fluxo de administração de plano de contas. */
  findOrCreateAccount(ctx: TenantContext, code: string, name: string, kind: AccountKind): Promise<string>;
  insertLedgerEntries(ctx: TenantContext, entries: readonly LedgerEntry[]): Promise<void>;
  /** Transiciona a reserva associada para `confirmed` (chamado só quando o pagamento captura —
   * mesmo UPDATE simples já usado em Server Actions do cockpit). */
  confirmReservation(ctx: TenantContext, reservationId: string): Promise<void>;
}

export function createDrizzlePaymentRepo(): PaymentRepo {
  return {
    async getPaymentIntentById(ctx, id) {
      return withTenant(ctx, async (db) => {
        const [row] = await db.select().from(paymentIntents).where(eq(paymentIntents.id, id));
        return row;
      });
    },

    async updatePaymentIntentStatus(ctx, id, status) {
      await withTenant(ctx, async (db) => {
        await db.update(paymentIntents).set({ status }).where(eq(paymentIntents.id, id));
      });
    },

    async findOrCreateAccount(ctx, code, name, kind) {
      return withTenant(ctx, async (db) => {
        const [existing] = await db
          .select({ id: accounts.id })
          .from(accounts)
          .where(and(eq(accounts.tenantId, ctx.tenantId), eq(accounts.code, code)));
        if (existing) {
          return existing.id;
        }

        const [created] = await db
          .insert(accounts)
          .values({ tenantId: ctx.tenantId, code, name, kind })
          .returning({ id: accounts.id });
        if (!created) {
          throw new Error(`Falha ao criar conta "${code}" — INSERT não retornou id.`);
        }
        return created.id;
      });
    },

    async insertLedgerEntries(ctx, entries) {
      if (entries.length === 0) {
        return;
      }
      await withTenant(ctx, async (db) => {
        await db.insert(ledgerEntries).values(
          entries.map((entry) => ({
            id: entry.id,
            tenantId: entry.tenantId,
            accountId: entry.accountId,
            direction: entry.direction,
            amountCents: entry.amountCents,
            currency: entry.currency,
            reservationId: entry.reservationId,
            reversalOfId: entry.reversalOfId,
            // LedgerEntry.createdAt é epoch ms (injetado pelo chamador, nunca Date.now() dentro
            // do domínio — ver packages/domain/src/ledger/ledger-entry.ts); a coluna do banco é
            // `timestamp`, que espera um `Date` no lado do drizzle.
            createdAt: new Date(entry.createdAt),
          })),
        );
      });
    },

    async confirmReservation(ctx, reservationId) {
      await withTenant(ctx, async (db) => {
        await db.update(reservations).set({ status: "confirmed" }).where(eq(reservations.id, reservationId));
      });
    },
  };
}
