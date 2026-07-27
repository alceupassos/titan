// Prova do portão de saída da Fase 0 (docs/roadmap.md): teste de isolamento de tenant sob
// PgBouncer REAL em modo transação — não um pool mockado. Requer Docker rodando.
//
// Exige Docker Desktop ativo nesta máquina. Se `docker version` falhar, este arquivo é pulado
// (describe.skip) em vez de quebrar o resto da suíte — mas a prova do portão de F0 continua
// pendente até rodar com sucesso (ver docs/fase-atual.md).
import { GenericContainer, Network, Wait } from "testcontainers";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { StartedTestContainer, StartedNetwork } from "testcontainers";
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

describe.skipIf(!dockerAvailable)("I: isolamento de tenant sob PgBouncer real (modo transação)", () => {
  let network: StartedNetwork;
  let postgres: StartedPostgreSqlContainer;
  let pgbouncer: StartedTestContainer;
  let pool: pg.Pool;

  beforeAll(async () => {
    network = await new Network().start();

    postgres = await new PostgreSqlContainer("postgres:17")
      .withNetwork(network)
      .withNetworkAliases("postgres")
      .withDatabase("titan_test")
      .withUsername("titan")
      .withPassword("titan_test_only")
      .start();

    // Aplica a migration 0000 direto (sem drizzle-kit) para manter o teste autocontido.
    const directClient = new pg.Client({ connectionString: postgres.getConnectionUri() });
    await directClient.connect();
    const migrationSql = readFileSync(
      path.join(import.meta.dirname, "..", "migrations", "0000_init.sql"),
      "utf8",
    );
    await directClient.query(migrationSql);
    await directClient.end();

    // Userlist do PgBouncer precisa do hash md5 correto para o par usuário/senha do Postgres.
    const md5 = `md5${(await import("node:crypto"))
      .createHash("md5")
      .update("titan_test_onlytitan")
      .digest("hex")}`;

    pgbouncer = await new GenericContainer("edoburu/pgbouncer:latest")
      .withNetwork(network)
      .withNetworkAliases("pgbouncer")
      .withEnvironment({
        DATABASE_URL: `postgres://titan:titan_test_only@postgres:5432/titan_test`,
        POOL_MODE: "transaction",
        // Pool de tamanho 1: FORÇA duas conexões de cliente a compartilhar a MESMA conexão
        // física com o Postgres, sequencialmente — é isso que expõe o vazamento de `SET` sem
        // `LOCAL` sob pooling de transação. Um pool grande poderia mascarar o bug por sorte.
        MAX_CLIENT_CONN: "50",
        DEFAULT_POOL_SIZE: "1",
      })
      .withExposedPorts(6432)
      .withWaitStrategy(Wait.forLogMessage(/process up/i).withStartupTimeout(30_000))
      .start();

    const bouncerHost = pgbouncer.getHost();
    const bouncerPort = pgbouncer.getMappedPort(6432);
    pool = new pg.Pool({
      host: bouncerHost,
      port: bouncerPort,
      user: "titan",
      password: "titan_test_only",
      database: "titan_test",
      max: 2, // 2 clientes lógicos competindo pela 1 conexão física do pgbouncer
    });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await pgbouncer?.stop();
    await postgres?.stop();
    await network?.stop();
  });

  async function seedTwoTenants(): Promise<{ tenantA: string; tenantB: string }> {
    const direct = new pg.Client({ connectionString: postgres.getConnectionUri() });
    await direct.connect();
    const a = await direct.query("INSERT INTO tenants (name) VALUES ('Tenant A') RETURNING id");
    const b = await direct.query("INSERT INTO tenants (name) VALUES ('Tenant B') RETURNING id");
    const tenantA = a.rows[0].id as string;
    const tenantB = b.rows[0].id as string;
    await direct.query("INSERT INTO users (tenant_id, email) VALUES ($1, 'a@tenant-a.com')", [tenantA]);
    await direct.query("INSERT INTO users (tenant_id, email) VALUES ($1, 'b@tenant-b.com')", [tenantB]);
    await direct.end();
    return { tenantA, tenantB };
  }

  it("SET LOCAL (via set_config parametrizado) dentro de transação NÃO vaza entre tenants concorrentes", async () => {
    const { tenantA, tenantB } = await seedTwoTenants();

    async function readUsersAsTenant(tenantId: string): Promise<string[]> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        const res = await client.query("SELECT email FROM users");
        await client.query("COMMIT");
        return res.rows.map((r) => r.email as string);
      } finally {
        client.release();
      }
    }

    // Dispara muitas transações concorrentes alternando entre os dois tenants — com
    // DEFAULT_POOL_SIZE=1 no pgbouncer, a MESMA conexão física é reciclada entre elas.
    const rounds = 20;
    const results = await Promise.all(
      Array.from({ length: rounds }, (_, i) => readUsersAsTenant(i % 2 === 0 ? tenantA : tenantB)),
    );

    results.forEach((emails, i) => {
      const expected = i % 2 === 0 ? "a@tenant-a.com" : "b@tenant-b.com";
      expect(emails).toEqual([expected]); // ZERO vazamento cruzado, mesmo sob conexão reciclada
    });
  }, 60_000);

  it("CONTROLE NEGATIVO: SET sem LOCAL vaza contexto de tenant sob a mesma pool reciclada", async () => {
    const { tenantA, tenantB } = await seedTwoTenants();

    // Conexão dedicada (max:1 implícito ao usar um único client) para garantir reuso físico
    // determinístico dentro deste teste específico.
    const client = await pool.connect();
    try {
      // Cliente 1 seta o tenant SEM LOCAL (não está dentro de uma transação com escopo real).
      await client.query(`SET app.tenant_id = '${tenantA}'`);
      const first = await client.query("SELECT email FROM users");
      expect(first.rows.map((r) => r.email)).toEqual(["a@tenant-a.com"]);

      // "Libera" a conexão de volta ao pool sem resetar o parâmetro de sessão — é exatamente o
      // que block-set-without-local.mjs existe para impedir no código real do produto.
      client.release();

      const secondClient = await pool.connect();
      try {
        // Não chamamos set_config aqui — se a MESMA conexão física do pgbouncer for reciclada,
        // o app.tenant_id de Tenant A ainda está ativo na sessão, e este segundo "cliente" (que
        // nunca pediu para ver dados de Tenant A) os recebe mesmo assim.
        const leaked = await secondClient.query("SELECT email FROM users");
        // Este teste documenta o vazamento; se a asserção abaixo falhar, o pgbouncer/postgres
        // reciclou para uma conexão fisicamente diferente desta vez (não determinístico sem
        // pool_size=1 real) — nesse caso o teste é inconclusivo, não uma prova de segurança.
        expect(leaked.rows.map((r) => r.email)).toEqual(["a@tenant-a.com"]);
      } finally {
        secondClient.release();
      }

      void tenantB; // mantido para simetria de seed; não usado neste controle específico
    } finally {
      // client já foi liberado acima
    }
  }, 60_000);
});
