import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/*.ts",
  out: "./migrations",
  dbCredentials: {
    // Migrations rodam como `titan` (admin/superusuário), DIRETO no Postgres — nunca pelo
    // PgBouncer (DDL sob pooling de transação é problemático) e nunca como `titan_app` (que não
    // tem privilégio para os GRANT/CREATE que as migrations fazem). A aplicação em runtime usa
    // `titan_app` via PgBouncer — ver packages/db/src/client.ts. Duas connection strings
    // distintas de propósito: DATABASE_ADMIN_URL aqui, DATABASE_URL no client de runtime.
    url:
      process.env.DATABASE_ADMIN_URL ?? "postgresql://titan:titan_dev_only@localhost:5432/titan_dev",
  },
});
