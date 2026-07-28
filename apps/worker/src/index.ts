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
import type { Channel } from "@titan/domain";
import { IcalChannelAdapter, AirbnbBrowserAutomationAdapter, type ChannelAdapter } from "@titan/channels";
import { resolveChannelAdapter } from "./channel-adapter-port";
import { createChannelSyncQueue, createChannelSyncWorker, registerChannelSyncDlq } from "./channel-queue";
import { createDrizzleChannelSyncRepo } from "./channel-sync-repo";
import { processChannelSyncJob } from "./jobs/process-channel-sync";
import { createReconciliationQueue, createReconciliationWorker, scheduleDailyReconciliation } from "./reconciliation-queue";
import { reconcileChannelsJob } from "./jobs/reconcile-channels";
import { createIngestionQueue, createIngestionWorker, scheduleIngestion } from "./ingestion-queue";
import { ingestExternalReservationsJob } from "./jobs/ingest-external-reservations";
import { createDrizzleExternalReservationRepo } from "./external-reservation-repo";

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

// Registro de adapters de canal (Fase 3, Passo 5 — integração final, docs/fase-atual.md).
// Backbone seguro: iCal para os 4 canais (só disponibilidade — capabilities já reflete isso, ver
// packages/channels/src/ical/adapter.ts). Airbnb ganha uma SOBRESCRITA: automação via navegador
// (ADR-0020 — decisão de risco explícita do usuário, ToS do Airbnb tipicamente violado, kill
// switch via `AIRBNB_CHANNEL_ENABLED=false`) cobre tarifa/reserva estruturada que o iCal não
// alcança. Se as credenciais do Airbnb não estiverem configuradas (`AIRBNB_HOST_EMAIL`/
// `AIRBNB_HOST_PASSWORD` ausentes), o adapter de automação ainda é registrado, mas cada chamada
// falha com erro claro (`MissingAirbnbCredentialsError`) — nunca silenciosamente ignorado.
const CHANNELS_WITH_ICAL: readonly Channel[] = ["airbnb", "booking", "vrbo", "expedia"];
const channelRegistry = new Map<Channel, ChannelAdapter>(
  CHANNELS_WITH_ICAL.map((channel) => [channel, new IcalChannelAdapter(channel)]),
);
channelRegistry.set(
  "airbnb",
  new AirbnbBrowserAutomationAdapter({
    enabled: process.env.AIRBNB_CHANNEL_ENABLED !== "false",
  }),
);

// Fila/worker de sincronização de canal (Fase 3, Passo 4c/5 — docs/fase-atual.md).
const channelSyncRepo = createDrizzleChannelSyncRepo();
const channelSyncQueue = createChannelSyncQueue(redisConnection);
const channelSyncWorker = createChannelSyncWorker(redisConnection, (payload) =>
  processChannelSyncJob(payload, {
    resolveAdapter: (channel) => resolveChannelAdapter(channel, channelRegistry),
    repo: channelSyncRepo,
    now: () => Date.now(),
  }),
);
registerChannelSyncDlq(channelSyncWorker, {
  insertChannelSyncLog: (entry) =>
    channelSyncRepo.insertChannelSyncLog({ tenantId: entry.tenantId, actorId: `channel-sync-dlq:${entry.channel}` }, entry),
});
channelSyncWorker.on("error", (err) => {
  console.error("[worker] erro no worker de sincronização de canal:", err);
});

// Fila/worker de reconciliação diária — mesmo registry de adapters do bloco acima.
const reconciliationQueue = createReconciliationQueue(redisConnection);
const reconciliationWorker = createReconciliationWorker(redisConnection, () =>
  reconcileChannelsJob({
    listAllListingMappings: () => adminDb.listAllListingMappings(),
    resolveAdapter: (channel) => resolveChannelAdapter(channel, channelRegistry),
    insertDivergences: (ctx, divs) => channelSyncRepo.insertDivergences(ctx, divs),
    now: () => Date.now(),
  }),
);
reconciliationWorker.on("error", (err) => {
  console.error("[worker] erro no worker de reconciliação de canal:", err);
});
scheduleDailyReconciliation(reconciliationQueue).catch((err: unknown) => {
  console.error("[worker] falha ao agendar a reconciliação diária:", err);
});

// Fila/worker de ingestão de reserva externa (Fase 3, Passo 5 — integração final). Reusa
// `paymentRepo` (contas/ledger) e `channelSyncRepo` (divergências) — nenhum repo duplicado.
const externalReservationRepo = createDrizzleExternalReservationRepo();
const ingestionQueue = createIngestionQueue(redisConnection);
const ingestionWorker = createIngestionWorker(redisConnection, () =>
  ingestExternalReservationsJob({
    listAllListingMappings: () => adminDb.listAllListingMappings(),
    resolveAdapter: (channel) => resolveChannelAdapter(channel, channelRegistry),
    insertExternalReservation: (ctx, input) => externalReservationRepo.insertExternalReservation(ctx, input),
    findOrCreateAccount: (ctx, code, name, kind) => paymentRepo.findOrCreateAccount(ctx, code, name, kind),
    insertLedgerEntries: (ctx, entries) => paymentRepo.insertLedgerEntries(ctx, entries),
    insertDivergences: (ctx, divs) => channelSyncRepo.insertDivergences(ctx, divs),
    idGenerator: () => randomUUID(),
    now: () => Date.now(),
  }),
);
ingestionWorker.on("error", (err) => {
  console.error("[worker] erro no worker de ingestão de reserva externa:", err);
});
scheduleIngestion(ingestionQueue).catch((err: unknown) => {
  console.error("[worker] falha ao agendar a ingestão de reserva externa:", err);
});

httpServer.listen(config.httpPort, () => {
  console.log(`[worker] servidor HTTP de webhooks ouvindo na porta ${config.httpPort} (POST /webhooks/:gateway).`);
});

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM recebido, encerrando graciosamente...");
  httpServer.close();
  await webhookWorker.close();
  await webhookQueue.close();
  await channelSyncWorker.close();
  await channelSyncQueue.close();
  await reconciliationWorker.close();
  await reconciliationQueue.close();
  await ingestionWorker.close();
  await ingestionQueue.close();
  await adminDb.close();
  await redisConnection.quit();
  process.exit(0);
});

console.log("[worker] Titan Stay worker iniciado (HTTP de webhooks + BullMQ: pagamentos + canais).");
