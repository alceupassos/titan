import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

// Conecta SEMPRE como `titan_app` (não-superusuário, NOBYPASSRLS) — nunca como `titan`
// (superusuário da imagem oficial do Postgres, criado via POSTGRES_USER). FORCE ROW LEVEL
// SECURITY não vale para superusuário: conectar como `titan` deixaria toda a RLS inerte em
// silêncio (achado F-1 da auditoria de segurança da Fase 0). `titan_app` é criado por
// infra/postgres/init/01-app-role.sh e recebe seus privilégios em
// packages/db/migrations/0001_app_role_grants_and_rls.sql.
const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? "postgresql://titan_app:titan_app_dev_only@localhost:6432/titan_dev",
});

export type TenantDb = ReturnType<typeof drizzle<typeof schema, pg.PoolClient>>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class InvalidTenantIdError extends Error {
  constructor(value: string) {
    super(`tenantId inválido (esperado uuid): ${value}`);
    this.name = "InvalidTenantIdError";
  }
}

/** Contexto de sessão obrigatório para toda query tenant-scoped (docs/adr/0007). `actorId`
 * alimenta `audit_log`/RLS de auditoria; `ownerScope` é usado pelas políticas do Owner Portal
 * (ainda não existem na Fase 0, mas o parâmetro de sessão já fica disponível para elas). */
export interface TenantContext {
  tenantId: string;
  actorId: string;
  ownerScope?: string;
}

/**
 * ÚNICA forma correta de rodar queries tenant-scoped sob PgBouncer em modo transação
 * (docs/adr/0007-multi-tenancy-rls.md).
 *
 * Abre uma transação explícita e seta `app.tenant_id`, `app.actor_id` e `app.owner_scope` com
 * `set_config(..., true)` — o terceiro argumento `true` é o equivalente parametrizável de
 * `SET LOCAL`: o valor só vale dentro desta transação e nunca vaza para a próxima vez que o pool
 * reciclar esta conexão física para outro tenant. Usar `set_config` (função, parametrizável) em
 * vez de `SET LOCAL app.tenant_id = '...'` (string interpolada) também elimina o risco de
 * injeção SQL nos valores.
 */
export async function withTenant<T>(
  context: TenantContext,
  fn: (db: TenantDb) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(context.tenantId)) {
    throw new InvalidTenantIdError(context.tenantId);
  }
  if (!context.actorId.trim()) {
    throw new RangeError("actorId é obrigatório em withTenant — toda ação é atribuível a um ator.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT set_config('app.tenant_id', $1, true), set_config('app.actor_id', $2, true), set_config('app.owner_scope', $3, true)",
      [context.tenantId, context.actorId, context.ownerScope ?? ""],
    );
    // drizzle instance vinculada a ESTE client físico, dentro da MESMA transação onde o
    // set_config acima rodou — nunca ao pool inteiro. Ligar ao pool reabriria o risco que este
    // wrapper existe para fechar (uma query poderia pegar outra conexão física, sem contexto).
    const scopedDb = drizzle(client, { schema });
    const result = await fn(scopedDb);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
