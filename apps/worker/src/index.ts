// Worker persistente (seção 5.5 do prompt único). Fase 0: só prova a forma — conexão com Redis
// e uma fila de exemplo. Filas reais (canais, fiscal, pricing) nascem por fase, conforme o
// bounded context correspondente é implementado.
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null, // exigido pelo BullMQ para workers de longa duração
});

export const healthcheckQueue = new Queue("healthcheck", { connection });

const worker = new Worker(
  "healthcheck",
  async (job) => {
    console.log(`[worker] healthcheck job ${job.id} processado em ${new Date().toISOString()}`);
  },
  { connection },
);

worker.on("error", (err) => {
  console.error("[worker] erro:", err);
});

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM recebido, encerrando graciosamente...");
  await worker.close();
  await connection.quit();
  process.exit(0);
});

console.log("[worker] Titan Stay worker iniciado. Aguardando jobs...");
