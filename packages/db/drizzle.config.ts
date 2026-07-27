import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/*.ts",
  out: "./migrations",
  dbCredentials: {
    // Aponta para o PgBouncer local em dev — não direto no Postgres — para que o desenvolvedor
    // já trabalhe sob o mesmo modo de pooling que a aplicação usa em produção.
    url: process.env.DATABASE_URL ?? "postgresql://titan:titan_dev_only@localhost:6432/titan_dev",
  },
});
