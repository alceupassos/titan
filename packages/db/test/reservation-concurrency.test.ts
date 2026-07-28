// Prova do portão de saída da Fase 1 (docs/roadmap.md): "100 reservas simultâneas mesma noite
// → exatamente 1 confirma". Este é o teste central da invariante I1 (docs/invariantes.md):
// "uma unidade nunca tem duas reservas confirmadas com períodos sobrepostos, independentemente
// do canal" — garantida pela constraint `EXCLUDE USING gist` de
// `packages/db/migrations/0002_availability_rates_reservations.sql`, não por disciplina de
// aplicação. O árbitro final de concorrência é o banco: a fila serializada por `unit_id` e o
// `SELECT ... FOR UPDATE` do domínio (ver ADR correspondente) são otimização de UX/latência, não
// a garantia — este teste dispara ~100 tentativas SEM nenhuma coordenação de aplicação para
// provar que o banco sozinho já impede o double-booking.
//
// Exige Docker Desktop ativo nesta máquina. Se `docker version` falhar, este arquivo é pulado
// (describe.skip) em vez de quebrar o resto da suíte — mas a prova do portão de F1 continua
// pendente até rodar com sucesso (mesmo padrão de test/tenant-isolation.pgbouncer.test.ts).
//
// Diferente do teste de PgBouncer, este teste NÃO precisa de PgBouncer no meio — ele prova a
// constraint EXCLUDE do Postgres, não vazamento de tenant sob pooling. Conecta como `titan_app`
// (não-superusuário, NOBYPASSRLS) diretamente ao Postgres efêmero do container.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dockerAvailable = await isDockerAvailable();

async function isDockerAvailable(): Promise<boolean> {
  try {
    const { execSync } = await import("node:child_process");
    execSync("docker version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const APP_PASSWORD = "titan_app_test_only";

// Nome do banco de teste propositalmente igual ao hardcoded em
// `0001_app_role_grants_and_rls.sql` (`GRANT CONNECT ON DATABASE titan_dev TO titan_app`) — essa
// migration nunca é alterada (regra dura do CLAUDE.md), então o banco efêmero deste teste
// precisa se chamar `titan_dev` para o GRANT aplicar sem erro. Usar outro nome faria o bootstrap
// falhar com "database titan_dev does not exist" antes mesmo do teste de concorrência rodar.
const TEST_DATABASE = "titan_dev";

describe.skipIf(!dockerAvailable)("I1: EXCLUDE USING gist impede reservas sobrepostas sob concorrência real", () => {
  let postgres: StartedPostgreSqlContainer;
  let pool: pg.Pool;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer("postgres:17")
      .withDatabase(TEST_DATABASE)
      .withUsername("titan")
      .withPassword("titan_test_only")
      .start();

    // Bootstrap administrativo como `titan` (superusuário desta imagem efêmera): cria o papel
    // não-superusuário `titan_app` (Testcontainers não roda infra/postgres/init/*.sh, então essa
    // parte do bootstrap real precisa ser replicada aqui) e aplica as três migrations em ordem,
    // via `readFileSync` direto — nunca reescritas à mão neste arquivo de teste.
    const adminClient = new pg.Client({ connectionString: postgres.getConnectionUri() });
    await adminClient.connect();
    await adminClient.query(
      `CREATE ROLE titan_app LOGIN PASSWORD '${APP_PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;`,
    );

    const migrationsDir = path.join(import.meta.dirname, "..", "migrations");
    const migration0000 = readFileSync(path.join(migrationsDir, "0000_init.sql"), "utf8");
    const migration0001 = readFileSync(path.join(migrationsDir, "0001_app_role_grants_and_rls.sql"), "utf8");
    const migration0002 = readFileSync(
      path.join(migrationsDir, "0002_availability_rates_reservations.sql"),
      "utf8",
    );
    await adminClient.query(migration0000);
    await adminClient.query(migration0001);
    await adminClient.query(migration0002);
    await adminClient.end();

    // Pool de teste conectado diretamente ao Postgres do container como `titan_app` — sem
    // PgBouncer no meio. `max` generoso o bastante para as ~100 tentativas concorrentes não
    // ficarem todas enfileiradas esperando conexão física (o que mascararia a corrida real).
    pool = new pg.Pool({
      host: postgres.getHost(),
      port: postgres.getMappedPort(5432),
      user: "titan_app",
      password: APP_PASSWORD,
      database: TEST_DATABASE,
      max: 100,
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await postgres?.stop();
  });

  /** Semeia um tenant e uma unidade novos via conexão administrativa direta (não `titan_app` —
   * evita qualquer interferência de RLS no setup, mesmo padrão de `seedTwoTenants` no teste de
   * PgBouncer). Cada teste usa seu próprio par tenant/unit para não vazar overlap entre casos. */
  async function seedTenantAndUnit(): Promise<{ tenantId: string; unitId: string }> {
    const direct = new pg.Client({ connectionString: postgres.getConnectionUri() });
    await direct.connect();
    const tenant = await direct.query("INSERT INTO tenants (name) VALUES ('Tenant Concorrência') RETURNING id");
    const tenantId = tenant.rows[0].id as string;
    const unit = await direct.query(
      "INSERT INTO units (tenant_id, name, status) VALUES ($1, 'Unidade 101', 'ready') RETURNING id",
      [tenantId],
    );
    const unitId = unit.rows[0].id as string;
    await direct.end();
    return { tenantId, unitId };
  }

  /** Uma tentativa de reserva, cada uma na sua própria transação — nenhuma coordenação de
   * aplicação entre as tentativas (nenhum lock, nenhuma fila). Se o INSERT violar a constraint
   * EXCLUDE, o erro sobe (rethrow) para que `Promise.allSettled` marque esta tentativa como
   * `rejected`, nunca engolido aqui dentro. */
  async function attemptReservation(
    tenantId: string,
    unitId: string,
    stay: string,
    status: "pending" | "confirmed" | "cancelled",
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      await client.query(
        `INSERT INTO reservations (tenant_id, unit_id, stay, status, channel, price_cents, currency)
         VALUES ($1, $2, $3::daterange, $4, 'direct', 10000, 'BRL')`,
        [tenantId, unitId, stay, status],
      );
      await client.query("COMMIT");
    } catch (err) {
      // A transação já foi abortada pelo Postgres após o erro do INSERT — ROLLBACK apenas
      // devolve a conexão a um estado limpo antes de liberá-la de volta ao pool.
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  it("100 tentativas concorrentes na MESMA unidade + MESMA estadia → exatamente 1 confirma", async () => {
    const { tenantId, unitId } = await seedTenantAndUnit();
    const sameStay = "[2026-06-01,2026-06-04)";

    const attempts = Array.from({ length: 100 }, () => attemptReservation(tenantId, unitId, sameStay, "pending"));
    // Promise.allSettled, não Promise.all — precisamos capturar tanto o único sucesso quanto as
    // ~99 falhas esperadas, sem que a primeira rejeição interrompa a coleta das demais.
    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<void> => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(99);

    // Toda falha precisa ser especificamente a violação da constraint EXCLUDE (código Postgres
    // `23P01`), nunca outro erro incidental (timeout de pool, deadlock, etc.) mascarado como
    // "a constraint funcionou".
    for (const r of rejected) {
      const reason = r.reason as { code?: string };
      expect(reason.code).toBe("23P01");
    }
  }, 60_000);

  it("CONTROLE POSITIVO: estadias disjuntas na MESMA unidade não conflitam entre si", async () => {
    const { tenantId, unitId } = await seedTenantAndUnit();

    // 100 reservas com datas completamente não sobrepostas na mesma unidade — se a constraint
    // EXCLUDE estivesse ampla demais (ex.: comparando só unit_id, ignorando o `&&` no
    // daterange), este teste pegaria esse falso positivo de bloqueio.
    function disjointStayFor(index: number): string {
      const startDay = 1 + index * 4; // cada estadia usa um bloco de 4 dias, sem sobreposição
      const start = new Date(Date.UTC(2026, 0, startDay));
      const end = new Date(Date.UTC(2026, 0, startDay + 3));
      const fmt = (d: Date) => d.toISOString().slice(0, 10);
      return `[${fmt(start)},${fmt(end)})`;
    }

    const attempts = Array.from({ length: 100 }, (_, i) =>
      attemptReservation(tenantId, unitId, disjointStayFor(i), "pending"),
    );
    const results = await Promise.allSettled(attempts);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(rejected).toHaveLength(0);
    expect(fulfilled).toHaveLength(100);
  }, 60_000);

  it("CONTROLE NEGATIVO: duas reservas 'cancelled' com a MESMA estadia sobreposta NÃO conflitam (filtro parcial da EXCLUDE)", async () => {
    const { tenantId, unitId } = await seedTenantAndUnit();
    const sameStay = "[2026-07-01,2026-07-04)";

    // A constraint EXCLUDE só se aplica `WHERE status IN ('pending', 'confirmed')` — reservas
    // `cancelled` com overlap total precisam conviver sem erro, provando que o filtro parcial
    // realmente restringe o escopo da constraint, e não é apenas cautela redundante.
    const results = await Promise.allSettled([
      attemptReservation(tenantId, unitId, sameStay, "cancelled"),
      attemptReservation(tenantId, unitId, sameStay, "cancelled"),
    ]);

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(0);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  }, 60_000);
});
