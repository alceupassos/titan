import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? "postgresql://titan:titan_dev_only@localhost:6432/titan_dev",
});

export const db = drizzle(pool, { schema });

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidTenantIdError extends Error {
  constructor(value: string) {
    super(`tenantId inválido (esperado uuid): ${value}`);
    this.name = "InvalidTenantIdError";
  }
}

/**
 * ÚNICA forma correta de rodar queries tenant-scoped sob PgBouncer em modo transação
 * (docs/adr/0007-multi-tenancy-rls.md).
 *
 * Abre uma transação explícita e seta `app.tenant_id` com `set_config(..., true)` — o terceiro
 * argumento `true` é o equivalente parametrizável de `SET LOCAL`: o valor só vale dentro desta
 * transação e nunca vaza para a próxima vez que o pool reciclar esta conexão física para outro
 * tenant. Usar `set_config` (função, parametrizável) em vez de `SET LOCAL app.tenant_id = '...'`
 * (string interpolada) também elimina o risco de injeção SQL no próprio tenantId.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new InvalidTenantIdError(tenantId);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Variante DELIBERADAMENTE insegura — existe só para o teste negativo em
 * test/tenant-isolation.pgbouncer.test.ts provar que `SET` sem `LOCAL` vaza contexto de tenant
 * sob pooling de transação. NUNCA importar fora de packages/db/test.
 */
export async function withTenantUnsafeForTestOnly<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    // Propositalmente SEM LOCAL — isto é o anti-padrão #8 / bloqueado por
    // .claude/hooks/block-set-without-local.mjs em qualquer código real do produto.
    await client.query(`SET app.tenant_id = '${tenantId}'`);
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
