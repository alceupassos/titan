// Fila BullMQ de emissão fiscal assíncrona disparada por evento (Fase 4, Passo 4b —
// docs/fase-atual.md, seção 9.6 do prompt único: "checkout, captura, virada de mês"). Mesmo
// padrão de `channel-queue.ts` (Fase 3): coalescing por `jobId` fixo, backoff exponencial com
// jitter, DLQ que grava o esgotamento de tentativas.
//
// Coalescing: `jobId` = a `naturalKey` determinística (`buildNaturalKey`, `@titan/domain`) do
// próprio fato gerador (`reservationId:event:referenceDate`) — duas tentativas de enfileirar o
// MESMO fato gerador (ex.: o webhook de captura chega duplicado antes de ser deduplicado, ou uma
// Server Action e um job batch tentam enfileirar a mesma emissão) colapsam num único job BullMQ,
// mesma técnica de `buildChannelSyncJobId`. Isto é uma camada a MAIS de defesa, não a idempotência
// forte em si — essa é garantida por `fiscal-repo.ts::insertFiscalDocumentIfNew`
// (`UNIQUE(natural_key)` no banco), que continua sendo o árbitro final mesmo se dois jobs BullMQ
// diferentes (jobId's diferentes, por algum motivo) processarem o mesmo fato gerador.
import { Queue, Worker, type ConnectionOptions, type Job, type JobsOptions } from "bullmq";
import { buildNaturalKey, type Cents, type FactGeneratorEvent } from "@titan/domain";
import type { CivilDate } from "@titan/dates";

export const FISCAL_ISSUANCE_QUEUE_NAME = "fiscal-issuance";

export interface FiscalIssuanceJobPayload {
  readonly tenantId: string;
  readonly reservationId: string;
  readonly event: FactGeneratorEvent;
  /** `CivilDate` como string crua no payload (Redis serializa JSON, não o branded type) —
   * `jobs/issue-fiscal-document.ts` reconstrói via `civilDate()` antes de usar. */
  readonly referenceDateISO: string;
  readonly municipalityCode: string;
  readonly serviceCode: string;
  readonly baseAmountCents: Cents;
  readonly currency: string;
  readonly takerDocument: string;
  readonly description: string;
}

/** `jobId` de coalescing — a própria chave natural do fato gerador. */
export function buildFiscalIssuanceJobId(payload: Pick<FiscalIssuanceJobPayload, "reservationId" | "event" | "referenceDateISO">): string {
  return buildNaturalKey({
    reservationId: payload.reservationId,
    event: payload.event,
    referenceDate: payload.referenceDateISO as CivilDate,
  });
}

const FISCAL_ISSUANCE_MAX_ATTEMPTS = 5;
const FISCAL_ISSUANCE_BACKOFF_BASE_DELAY_MS = 3_000;
const FISCAL_ISSUANCE_BACKOFF_JITTER = 0.2; // 20% — mesmo raciocínio de `channel-queue.ts`.

const FISCAL_ISSUANCE_JOB_OPTIONS: Omit<JobsOptions, "jobId"> = {
  attempts: FISCAL_ISSUANCE_MAX_ATTEMPTS,
  backoff: {
    type: "exponential",
    delay: FISCAL_ISSUANCE_BACKOFF_BASE_DELAY_MS,
    jitter: FISCAL_ISSUANCE_BACKOFF_JITTER,
  },
  // Sucesso não precisa ficar em Redis — o resultado já está em `fiscal_documents` (status
  // "issued"). Falha final fica disponível para inspeção/reprocesso manual, capado.
  removeOnComplete: true,
  removeOnFail: { count: 500 },
};

export function createFiscalIssuanceQueue(connection: ConnectionOptions): Queue<FiscalIssuanceJobPayload> {
  return new Queue<FiscalIssuanceJobPayload>(FISCAL_ISSUANCE_QUEUE_NAME, { connection });
}

/** Recorte mínimo de `Queue` usado por `enqueueFiscalIssuanceJob` — mesmo espírito de
 * `CoalescingQueue` em `channel-queue.ts`, para permitir teste sem BullMQ real. */
export interface CoalescingFiscalQueue {
  getJob(jobId: string): Promise<{ readonly id?: string } | undefined>;
  add(name: string, data: FiscalIssuanceJobPayload, opts: JobsOptions): Promise<unknown>;
}

export interface EnqueueFiscalIssuanceResult {
  readonly jobId: string;
  /** `false` quando já havia um job pendente para o MESMO fato gerador — coalescing, nada novo
   * enfileirado (o BullMQ também dedupe nativamente por `jobId` — ver comentário equivalente em
   * `channel-queue.ts::enqueueChannelSyncJob` sobre a checagem explícita ser defesa em
   * profundidade + testabilidade, não a única garantia). */
  readonly enqueued: boolean;
}

export async function enqueueFiscalIssuanceJob(
  queue: CoalescingFiscalQueue,
  payload: FiscalIssuanceJobPayload,
): Promise<EnqueueFiscalIssuanceResult> {
  const jobId = buildFiscalIssuanceJobId(payload);
  const existing = await queue.getJob(jobId);
  if (existing) {
    return { jobId, enqueued: false };
  }
  await queue.add(FISCAL_ISSUANCE_QUEUE_NAME, payload, { ...FISCAL_ISSUANCE_JOB_OPTIONS, jobId });
  return { jobId, enqueued: true };
}

export function createFiscalIssuanceWorker(
  connection: ConnectionOptions,
  processFn: (payload: FiscalIssuanceJobPayload) => Promise<void>,
): Worker<FiscalIssuanceJobPayload> {
  return new Worker<FiscalIssuanceJobPayload>(
    FISCAL_ISSUANCE_QUEUE_NAME,
    async (job) => {
      await processFn(job.data);
    },
    { connection },
  );
}

export interface FiscalIssuanceDlqDeps {
  /** Marca `rejected` a linha `pending` correspondente (se existir) — ver
   * `fiscal-repo.ts::markPendingFiscalDocumentRejectedByNaturalKey`. Esgotamento de tentativas
   * aqui significa falha de REDE/infra persistente (rejeição de NEGÓCIO já teria sido resolvida
   * — marcada `rejected` e NÃO relançada — na primeira tentativa, dentro do próprio job; nunca
   * chega a esgotar tentativas por esse motivo, ver `jobs/issue-fiscal-document.ts`). `tenantId`
   * é passado explicitamente (job.data já carrega) porque `markPendingFiscalDocumentRejectedByNaturalKey`
   * roda sob `withTenant()`, que exige um `TenantContext` — o handler de DLQ nunca deveria
   * precisar de uma conexão admin/cross-tenant para isto. */
  markPendingRejectedByNaturalKey(tenantId: string, naturalKey: string, reason: string): Promise<void>;
  logger?: Pick<Console, "log" | "error" | "warn">;
}

/** Recorte mínimo de `Job` usado pelo handler de DLQ — mesmo espírito de `DlqJobLike` em
 * `channel-queue.ts`. */
export type FiscalDlqJobLike = Pick<Job<FiscalIssuanceJobPayload>, "data" | "attemptsMade" | "opts">;

export interface FiscalIssuanceWorkerLike {
  on(event: "failed", listener: (job: FiscalDlqJobLike | undefined, err: Error) => void): unknown;
}

/**
 * Liga o handler de DLQ ao worker: só age quando a tentativa que falhou foi a ÚLTIMA
 * (`attemptsMade >= attempts` configurado) — tentativas intermediárias ainda vão ter retry
 * automático via backoff. Marca a linha `fiscal_documents` (se existir e ainda `pending`) como
 * `rejected` com `reason: "attempts_exhausted"` — sinal para o painel fiscal (fase futura) de que
 * esta emissão precisa de atenção humana/reprocesso manual, não vai se resolver sozinha.
 */
export function registerFiscalIssuanceDlq(worker: FiscalIssuanceWorkerLike, deps: FiscalIssuanceDlqDeps): void {
  const log = deps.logger ?? console;
  worker.on("failed", (job: FiscalDlqJobLike | undefined, err: Error) => {
    if (!job) {
      log.error(`[worker] job de fiscal-issuance falhou sem payload associado: ${err.message}`);
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return; // ainda vai haver retry — não é DLQ ainda.
    }
    const naturalKey = buildFiscalIssuanceJobId(job.data);
    deps
      .markPendingRejectedByNaturalKey(
        job.data.tenantId,
        naturalKey,
        `attempts_exhausted: ${job.attemptsMade}/${maxAttempts} tentativas, último erro: ${err.message}`,
      )
      .catch((markErr: unknown) => {
        log.error(
          `[worker] falha ao marcar fiscal_documents (natural_key="${naturalKey}") como rejected no DLQ: ` +
            `${(markErr as Error).message}`,
        );
      });
    log.error(
      `[worker] job de fiscal-issuance esgotou tentativas (${job.attemptsMade}/${maxAttempts}) — ` +
        `reserva ${job.data.reservationId}, evento ${job.data.event}, natural_key="${naturalKey}". ` +
        "Movido para DLQ (failed) pelo BullMQ.",
    );
  });
}
