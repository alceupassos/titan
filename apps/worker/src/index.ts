// Worker persistente (seção 5.5 do prompt único) — bootstrap real (Fase 2, Passo 5,
// docs/fase-atual.md): servidor HTTP de webhook (`http-server.ts`) + fila/worker BullMQ de
// processamento assíncrono (`queue.ts` + `jobs/process-webhook.ts`). Substitui o scaffold de
// healthcheck da Fase 0 (prova de forma só) — este arquivo agora conecta os pedaços reais.
import { randomUUID } from "node:crypto";
import IORedis from "ioredis";
import pg from "pg";
import { buildAdapterResolver, loadConfigFromEnv } from "./config";
import { createHttpServer } from "./http-server";
import { createAdminDb } from "./admin-db";
import { createDrizzlePaymentRepo } from "./payment-repo";
import { processWebhookJob } from "./jobs/process-webhook";
import { createWebhookQueue, createWebhookWorker } from "./queue";

const config = loadConfigFromEnv();
const resolveAdapter = buildAdapterResolver(config);

if (!config.asaas && !config.stripe) {
  console.warn(
    "[worker] nenhum gateway configurado (ASAAS_* / STRIPE_* ausentes do env) — o servidor HTTP " +
      "sobe, mas toda requisição de webhook será 404 até as credenciais serem configuradas.",
  );
}

const redisConnection = new IORedis(config.redisUrl, {
  maxRetriesPerRequest: null, // exigido pelo BullMQ para workers de longa duração
});

const adminPool = new pg.Pool({ connectionString: config.databaseAdminUrl });
const adminDb = createAdminDb(adminPool);
const paymentRepo = createDrizzlePaymentRepo();

const webhookQueue = createWebhookQueue(redisConnection);

const httpServer = createHttpServer({
  resolveAdapter,
  insertWebhookEventIfNew: (gateway, externalEventId) => adminDb.insertWebhookEventIfNew(gateway, externalEventId),
  enqueueWebhookJob: async (payload) => {
    await webhookQueue.add(payload.externalEventId, payload);
  },
});

const webhookWorker = createWebhookWorker(redisConnection, (payload) =>
  processWebhookJob(payload, {
    adminDb,
    paymentRepo,
    now: () => Date.now(),
    idGenerator: () => randomUUID(),
  }),
);

webhookWorker.on("error", (err) => {
  console.error("[worker] erro no worker de processamento de webhook:", err);
});

httpServer.listen(config.httpPort, () => {
  console.log(`[worker] servidor HTTP de webhooks ouvindo na porta ${config.httpPort} (POST /webhooks/:gateway).`);
});

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM recebido, encerrando graciosamente...");
  httpServer.close();
  await webhookWorker.close();
  await webhookQueue.close();
  await adminDb.close();
  await redisConnection.quit();
  process.exit(0);
});

console.log("[worker] Titan Stay worker iniciado (HTTP de webhooks + BullMQ).");
