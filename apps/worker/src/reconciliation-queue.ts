// Fila BullMQ de reconciliação diária (Fase 3, Passo 4c — seção 9.2 do prompt único: painel
// "Saúde da Distribuição"). Separada de `channel-queue.ts` de propósito: é uma fila de UM job
// repetido por agendamento cron, não uma fila de eventos por unidade/canal — misturar as duas
// faria o `attempts`/backoff de sincronização pontual (Passo 4c, item 1) se aplicar também ao
// job de reconciliação, que tem semântica bem diferente (roda 1x/dia, itera todos os
// mapeamentos, e um erro isolado num par unidade/canal não deveria derrubar/reagendar a rodada
// inteira — ver `jobs/reconcile-channels.ts`, que já captura erro por item e segue o loop).
import { Queue, Worker, type ConnectionOptions } from "bullmq";

export const RECONCILIATION_QUEUE_NAME = "channel-reconciliation";
export const DAILY_RECONCILIATION_JOB_NAME = "daily-reconciliation";

/** 03:00 todo dia — horário de menor tráfego, mesmo raciocínio de jobs de manutenção noturna. */
export const DAILY_RECONCILIATION_CRON = "0 3 * * *";

export function createReconciliationQueue(connection: ConnectionOptions): Queue<Record<string, never>> {
  return new Queue<Record<string, never>>(RECONCILIATION_QUEUE_NAME, { connection });
}

/** Recorte mínimo de `Queue` usado por `scheduleDailyReconciliation` — mesmo espírito de
 * `CoalescingQueue` em `channel-queue.ts`, para poder testar sem uma fila BullMQ real. */
export interface RepeatableQueue {
  add(name: string, data: Record<string, never>, opts: { repeat: { pattern: string }; jobId: string }): Promise<unknown>;
}

/**
 * Registra o job repetido (BullMQ agenda por cron nativamente via `repeat.pattern`, ver
 * node_modules/.../interfaces/repeat-options.d.ts). `jobId` fixo evita registrar o mesmo
 * agendamento repetido duas vezes se `index.ts` rodar `scheduleDailyReconciliation` mais de uma
 * vez (reinício do processo, por exemplo) — BullMQ já deduplica agendamentos repetidos pelo
 * `jobId`/`repeat.pattern` combinados, mas fixar o nome deixa isso explícito e fácil de
 * inspecionar no Redis/painel.
 */
export async function scheduleDailyReconciliation(queue: RepeatableQueue): Promise<void> {
  await queue.add(
    DAILY_RECONCILIATION_JOB_NAME,
    {},
    { repeat: { pattern: DAILY_RECONCILIATION_CRON }, jobId: DAILY_RECONCILIATION_JOB_NAME },
  );
}

export function createReconciliationWorker(
  connection: ConnectionOptions,
  processFn: () => Promise<void>,
): Worker<Record<string, never>> {
  return new Worker<Record<string, never>>(
    RECONCILIATION_QUEUE_NAME,
    async () => {
      await processFn();
    },
    { connection },
  );
}
