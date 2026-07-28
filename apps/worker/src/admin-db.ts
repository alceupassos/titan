// Conexão ADMINISTRATIVA (superusuário `titan`, DATABASE_ADMIN_URL, ignora RLS mesmo com FORCE
// ROW LEVEL SECURITY) — MESMO padrão já estabelecido em `packages/db/seed/index.ts` para o
// problema equivalente ("criar o primeiro tenant" lá, "descobrir o tenant de um evento externo"
// aqui). Usada SÓ para as duas operações que não podem passar por `withTenant()` (que exige um
// `tenantId` já conhecido):
//
//   1. INSERT em `webhook_events` (dedupe de I6) — tabela sem `tenant_id`/RLS de propósito
//      (packages/db/migrations/0003_ledger_approvals_payments.sql), o evento chega antes de
//      sabermos a qual tenant ele pertence.
//   2. SELECT em `payment_intents` por `external_id` — esta tabela TEM `tenant_id`+RLS; resolver
//      "a qual tenant este `externalId` pertence" exige, por definição, uma consulta que
//      atravesse todos os tenants, o que só a conexão admin permite.
//
// Depois de resolver o `tenantId` aqui, TODO o resto do processamento
// (`jobs/process-webhook.ts`) passa por `withTenant()` normalmente — nunca por esta conexão.
//
// Decisão de implementação: usa `drizzle(pool, { schema })` sobre o pool admin (em vez de SQL
// cru como o seed script) — ganha tipagem das duas tabelas envolvidas sem reimplementar
// serialização manual; `@titan/db` não exporta um `db` global de propósito (ver comentário em
// packages/db/src/index.ts), então este é o único lugar do worker que instancia drizzle fora de
// `withTenant()`, e só para estas duas tabelas.
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { paymentIntents, webhookEvents } from "@titan/db";
import type { Gateway } from "@titan/payments";

/** Recorte mínimo de `payment_intents` retornado pela consulta admin — literalmente
 * `SELECT tenant_id, id, status FROM payment_intents WHERE external_id = $1` (ver instrução da
 * tarefa). O restante dos campos (reservationId, amountCents, currency) é buscado de novo por
 * `PaymentRepo.getPaymentIntentById` já sob `withTenant()`, tenant-scoped — este lookup admin
 * existe só para aprender o `tenantId`, nunca para ser a fonte de verdade do processamento. */
export interface PaymentIntentTenantLookup {
  readonly id: string;
  readonly tenantId: string;
  readonly status: string;
}

export interface AdminDb {
  /** `true` se o INSERT criou uma linha nova (evento inédito); `false` se
   * `ON CONFLICT (gateway, external_event_id) DO NOTHING` não retornou linha (já processado). */
  insertWebhookEventIfNew(gateway: Gateway, externalEventId: string): Promise<boolean>;
  findPaymentIntentByExternalId(externalId: string): Promise<PaymentIntentTenantLookup | undefined>;
  close(): Promise<void>;
}

export function createAdminDb(pool: pg.Pool): AdminDb {
  const db = drizzle(pool, { schema: { paymentIntents, webhookEvents } });

  return {
    async insertWebhookEventIfNew(gateway, externalEventId) {
      const inserted = await db
        .insert(webhookEvents)
        .values({ gateway, externalEventId })
        .onConflictDoNothing()
        .returning({ id: webhookEvents.id });
      return inserted.length > 0;
    },

    async findPaymentIntentByExternalId(externalId) {
      const [row] = await db
        .select({ id: paymentIntents.id, tenantId: paymentIntents.tenantId, status: paymentIntents.status })
        .from(paymentIntents)
        .where(eq(paymentIntents.externalId, externalId));
      return row;
    },

    async close() {
      await pool.end();
    },
  };
}
