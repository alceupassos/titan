// Fila BullMQ de ingestão de reserva externa (Fase 3, Passo 5 — integração final,
// docs/fase-atual.md). Job repetido (mesmo padrão de `reconciliation-queue.ts`), mas com cadência
// bem mais curta: o portão de saída da fase exige "reserva de OTA bloqueia outros canais em
// <5 min" (docs/roadmap.md) — rodar 1x/dia como a reconciliação não cumpriria isso. A cada
// execução, `jobs/ingest-external-reservations.ts` só busca reservas das últimas 24h (idempotente
// por natureza da constraint EXCLUDE — reingerir a mesma reserva por engano falharia com
// `exclusion_violation`/divergência, nunca duplicaria a reserva).
import { Queue, Worker, type ConnectionOptions } from "bullmq";
import type { RepeatableQueue } from "./reconciliation-queue";

export const INGESTION_QUEUE_NAME = "channel-reservation-ingestion";
export const INGESTION_JOB_NAME = "ingest-external-reservations";

/** A cada 3 minutos — dentro da folga do portão de saída de "<5 min" (docs/roadmap.md, Fase 3),
 * considerando o tempo de execução do job em si. */
export const INGESTION_CRON = "*/3 * * * *";

export function createIngestionQueue(connection: ConnectionOptions): Queue<Record<string, never>> {
  return new Queue<Record<string, never>>(INGESTION_QUEUE_NAME, { connection });
}

export async function scheduleIngestion(queue: RepeatableQueue): Promise<void> {
  await queue.add(INGESTION_JOB_NAME, {}, { repeat: { pattern: INGESTION_CRON }, jobId: INGESTION_JOB_NAME });
}

export function createIngestionWorker(
  connection: ConnectionOptions,
  processFn: () => Promise<void>,
): Worker<Record<string, never>> {
  return new Worker<Record<string, never>>(
    INGESTION_QUEUE_NAME,
    async () => {
      await processFn();
    },
    { connection },
  );
}
