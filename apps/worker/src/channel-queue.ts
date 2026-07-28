// Fila BullMQ de sincronização de canal (Fase 3, Passo 4c — docs/fase-atual.md), mesmo padrão de
// `queue.ts` (Fase 2, webhook de pagamento), adaptado para os três requisitos específicos desta
// fila (seção 9.2 do prompt único: "fila por unidade com coalescing de deltas"):
//
//   1. Coalescing: o `jobId` fixo (`buildChannelSyncJobId`) é `${tenantId}:${unitId}:${channel}:
//      ${kind}`. `enqueueChannelSyncJob` checa `queue.getJob(jobId)` antes de adicionar — se já
//      existe um job pendente para a MESMA unidade/canal/tipo de delta, a nova chamada é um no-op
//      (retorna `enqueued: false`), nunca duplica. O BullMQ também tem uma segunda camada nativa
//      de proteção aqui: "If you attempt to add a job with an id that already exists, it will not
//      be added" (docs/esm/interfaces/base-job-options.d.ts, `jobId`) — a checagem explícita via
//      `getJob` é redundante com essa garantia nativa de propósito (defesa em profundidade contra
//      a corrida entre o `getJob` e o `add` desta função) E, principalmente, para deixar o
//      comportamento observável/testável com uma fila fake simples (sem simular o Lua script real
//      do BullMQ em teste).
//   2. Backoff exponencial com jitter: `backoff: { type: "exponential", delay, jitter }` — jitter
//      é NATIVO desta versão instalada do BullMQ (5.81.2, ver
//      node_modules/.../interfaces/backoff-options.d.ts: `jitter?: number` — "Percentage of
//      jitter usage"), não precisou de implementação manual.
//   3. DLQ por canal: `attempts` máximo configurado; ao esgotar, o próprio BullMQ move o job para
//      "failed" — `registerChannelSyncDlq` escuta `worker.on("failed", ...)`, confirma que é a
//      tentativa FINAL (`job.attemptsMade >= (job.opts.attempts ?? 1)`, para não gravar em toda
//      tentativa intermediária que ainda vai fazer retry) e grava uma linha em `channel_sync_log`
//      com `status: "error"` para o painel do cockpit (outra faixa) listar/reprocessar.
import { Queue, Worker, type ConnectionOptions, type Job, type JobsOptions } from "bullmq";
import type { Channel } from "@titan/domain";

export const CHANNEL_SYNC_QUEUE_NAME = "channel-sync";

export type ChannelSyncKind = "availability" | "rates";

/**
 * Payload deliberadamente estreito (mesmo espírito de `WebhookJobPayload` em `queue.ts`): carrega
 * só o `kind` (QUAL delta mudou), nunca o delta em si — o job busca o estado atual do banco quando
 * processar (`jobs/process-channel-sync.ts`), para nunca aplicar um delta "stale" se várias
 * mudanças da mesma unidade chegarem em sequência antes do job rodar.
 */
export interface ChannelSyncJobPayload {
  readonly tenantId: string;
  readonly unitId: string;
  readonly channel: Channel;
  readonly kind: ChannelSyncKind;
}

/** `${tenantId}:${unitId}:${channel}:${kind}` — chave de coalescing. Múltiplas mudanças da MESMA
 * unidade/canal/tipo colapsam neste único `jobId` enquanto o job anterior ainda não rodou. */
export function buildChannelSyncJobId(payload: ChannelSyncJobPayload): string {
  return `${payload.tenantId}:${payload.unitId}:${payload.channel}:${payload.kind}`;
}

const CHANNEL_SYNC_MAX_ATTEMPTS = 5;
const CHANNEL_SYNC_BACKOFF_BASE_DELAY_MS = 2_000;
const CHANNEL_SYNC_BACKOFF_JITTER = 0.2; // 20% — suavemente aleatoriza a onda de retry (thundering herd)

const CHANNEL_SYNC_JOB_OPTIONS: Omit<JobsOptions, "jobId"> = {
  attempts: CHANNEL_SYNC_MAX_ATTEMPTS,
  backoff: { type: "exponential", delay: CHANNEL_SYNC_BACKOFF_BASE_DELAY_MS, jitter: CHANNEL_SYNC_BACKOFF_JITTER },
  // Sucesso não precisa ficar em Redis (o resultado já foi persistido em `channel_sync_log`).
  removeOnComplete: true,
  // Falha final fica disponível para o painel de saúde da distribuição listar/reprocessar
  // (mesmo raciocínio de `channel_sync_log`, mas do lado do BullMQ) — capado para não crescer
  // indefinidamente em Redis.
  removeOnFail: { count: 500 },
};

export function createChannelSyncQueue(connection: ConnectionOptions): Queue<ChannelSyncJobPayload> {
  return new Queue<ChannelSyncJobPayload>(CHANNEL_SYNC_QUEUE_NAME, { connection });
}

/** Recorte mínimo de `Queue` usado por `enqueueChannelSyncJob` — permite injetar uma fila fake em
 * teste sem simular a API inteira do BullMQ (mesmo espírito de injeção de dependência do resto do
 * worker). */
export interface CoalescingQueue {
  getJob(jobId: string): Promise<{ readonly id?: string } | undefined>;
  add(name: string, data: ChannelSyncJobPayload, opts: JobsOptions): Promise<unknown>;
}

export interface EnqueueChannelSyncResult {
  readonly jobId: string;
  /** `false` quando um job para a mesma unidade/canal/tipo já estava pendente — coalescing, nada
   * novo foi enfileirado. */
  readonly enqueued: boolean;
}

export async function enqueueChannelSyncJob(
  queue: CoalescingQueue,
  payload: ChannelSyncJobPayload,
): Promise<EnqueueChannelSyncResult> {
  const jobId = buildChannelSyncJobId(payload);
  const existing = await queue.getJob(jobId);
  if (existing) {
    return { jobId, enqueued: false };
  }
  await queue.add(CHANNEL_SYNC_QUEUE_NAME, payload, { ...CHANNEL_SYNC_JOB_OPTIONS, jobId });
  return { jobId, enqueued: true };
}

export function createChannelSyncWorker(
  connection: ConnectionOptions,
  processFn: (payload: ChannelSyncJobPayload) => Promise<void>,
): Worker<ChannelSyncJobPayload> {
  return new Worker<ChannelSyncJobPayload>(
    CHANNEL_SYNC_QUEUE_NAME,
    async (job) => {
      await processFn(job.data);
    },
    { connection },
  );
}

export interface ChannelSyncLogEntry {
  readonly tenantId: string;
  readonly unitId: string;
  readonly channel: Channel;
  readonly direction: "push" | "pull";
  readonly status: "ok" | "error";
  readonly detail: Readonly<Record<string, unknown>>;
}

export interface ChannelSyncDlqDeps {
  insertChannelSyncLog(entry: ChannelSyncLogEntry): Promise<void>;
  logger?: Pick<Console, "log" | "error" | "warn">;
}

/** Recorte mínimo de `Job` que o handler de DLQ precisa — permite testar com um objeto simples em
 * vez de um `Job` real do BullMQ. */
export type DlqJobLike = Pick<Job<ChannelSyncJobPayload>, "data" | "attemptsMade" | "opts">;

/** Recorte mínimo de `Worker` usado por `registerChannelSyncDlq` — só o evento `"failed"`, com um
 * `listener` de aridade 2 (o `Worker` real do BullMQ chama o listener com um 3º argumento `prev`,
 * mas funções JS/TS podem ignorar argumentos extras; um listener de aridade menor é sempre
 * atribuível onde um de aridade maior é esperado). Deliberadamente NÃO usa
 * `Pick<Worker<ChannelSyncJobPayload>, "on">` diretamente: a assinatura genérica real de
 * `Worker.on` (um overload por nome de evento) não é estruturalmente compatível com um fake de
 * teste simples (mock não-genérico) — este tipo estreito é o que permite testar sem BullMQ real. */
export interface ChannelSyncWorkerLike {
  on(event: "failed", listener: (job: DlqJobLike | undefined, err: Error) => void): unknown;
}

/**
 * Liga o handler de DLQ ao worker: só grava em `channel_sync_log` quando a tentativa que falhou
 * foi a ÚLTIMA (`attemptsMade >= attempts` configurado) — tentativas intermediárias já vão ter
 * retry automático via backoff, gravar nelas também poluiria o painel com "erros" que na verdade
 * ainda vão se resolver sozinhos. `jobs/process-channel-sync.ts` já grava uma linha de
 * `status: "error"` a cada tentativa que falha (histórico completo); esta linha aqui é o marcador
 * específico de "esgotou as tentativas, precisa de atenção humana ou reprocesso manual".
 */
export function registerChannelSyncDlq(worker: ChannelSyncWorkerLike, deps: ChannelSyncDlqDeps): void {
  const log = deps.logger ?? console;
  worker.on("failed", (job: DlqJobLike | undefined, err: Error) => {
    if (!job) {
      log.error(`[worker] job de channel-sync falhou sem payload associado: ${err.message}`);
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return; // ainda vai haver retry — não é DLQ ainda.
    }
    deps
      .insertChannelSyncLog({
        tenantId: job.data.tenantId,
        unitId: job.data.unitId,
        channel: job.data.channel,
        direction: "push",
        status: "error",
        detail: { reason: "attempts_exhausted", kind: job.data.kind, attemptsMade: job.attemptsMade, error: err.message },
      })
      .catch((logErr: unknown) => {
        log.error(
          `[worker] falha ao gravar channel_sync_log de DLQ (unidade ${job.data.unitId}, canal ${job.data.channel}): ` +
            `${(logErr as Error).message}`,
        );
      });
    log.error(
      `[worker] job de channel-sync esgotou tentativas (${job.attemptsMade}/${maxAttempts}) — unidade ${job.data.unitId}, ` +
        `canal ${job.data.channel}, kind ${job.data.kind}. Movido para DLQ (failed) pelo BullMQ.`,
    );
  });
}
