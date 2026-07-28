import { describe, expect, it, vi } from "vitest";
import {
  buildChannelSyncJobId,
  enqueueChannelSyncJob,
  registerChannelSyncDlq,
  type ChannelSyncJobPayload,
  type CoalescingQueue,
  type DlqJobLike,
} from "./channel-queue";

/**
 * Fila fake em memória — implementa só `getJob`/`add` (o recorte `CoalescingQueue`), sem BullMQ/
 * Redis reais. `add` grava por `jobId`; `getJob` simula exatamente a garantia nativa do BullMQ
 * documentada em `channel-queue.ts` ("se o jobId já existe, não duplica").
 */
function buildFakeQueue(): CoalescingQueue & { jobs: Map<string, ChannelSyncJobPayload> } {
  const jobs = new Map<string, ChannelSyncJobPayload>();
  return {
    jobs,
    async getJob(jobId) {
      const data = jobs.get(jobId);
      return data ? { id: jobId } : undefined;
    },
    async add(_name, data, opts) {
      jobs.set(opts.jobId!, data);
      return { id: opts.jobId };
    },
  };
}

function buildPayload(overrides: Partial<ChannelSyncJobPayload> = {}): ChannelSyncJobPayload {
  return { tenantId: "t1", unitId: "u1", channel: "airbnb", kind: "availability", ...overrides };
}

describe("buildChannelSyncJobId", () => {
  it("monta a chave de coalescing tenantId:unitId:channel:kind", () => {
    expect(buildChannelSyncJobId(buildPayload())).toBe("t1:u1:airbnb:availability");
  });
});

describe("enqueueChannelSyncJob — coalescing", () => {
  it("enfileira normalmente quando não há job pendente para a mesma chave", async () => {
    const queue = buildFakeQueue();
    const result = await enqueueChannelSyncJob(queue, buildPayload());
    expect(result).toEqual({ jobId: "t1:u1:airbnb:availability", enqueued: true });
    expect(queue.jobs.size).toBe(1);
  });

  it("colapsa duas chamadas para a MESMA unidade/canal/tipo num único job real", async () => {
    const queue = buildFakeQueue();
    const first = await enqueueChannelSyncJob(queue, buildPayload());
    const second = await enqueueChannelSyncJob(queue, buildPayload());

    expect(first.enqueued).toBe(true);
    expect(second.enqueued).toBe(false);
    expect(queue.jobs.size).toBe(1); // só 1 job real, não 2.
  });

  it("NÃO colapsa quando unidade, canal ou kind diferem", async () => {
    const queue = buildFakeQueue();
    await enqueueChannelSyncJob(queue, buildPayload());
    await enqueueChannelSyncJob(queue, buildPayload({ unitId: "u2" }));
    await enqueueChannelSyncJob(queue, buildPayload({ channel: "booking" }));
    await enqueueChannelSyncJob(queue, buildPayload({ kind: "rates" }));

    expect(queue.jobs.size).toBe(4);
  });
});

/** Worker fake mínimo — só o `on("failed", ...)` que `registerChannelSyncDlq` precisa. */
function buildFakeWorker() {
  let failedHandler: ((job: DlqJobLike | undefined, err: Error) => void) | undefined;
  return {
    on: vi.fn((event: string, handler: (job: DlqJobLike | undefined, err: Error) => void) => {
      if (event === "failed") {
        failedHandler = handler;
      }
    }),
    emitFailed(job: DlqJobLike | undefined, err: Error) {
      failedHandler?.(job, err);
    },
  };
}

describe("registerChannelSyncDlq", () => {
  it("grava channel_sync_log só quando a tentativa que falhou foi a última (esgotou attempts)", async () => {
    const worker = buildFakeWorker();
    const insertChannelSyncLog = vi.fn(async () => undefined);
    registerChannelSyncDlq(worker, { insertChannelSyncLog, logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() } });

    const job: DlqJobLike = { data: buildPayload(), attemptsMade: 5, opts: { attempts: 5 } };
    worker.emitFailed(job, new Error("falha de rede"));

    await vi.waitFor(() => expect(insertChannelSyncLog).toHaveBeenCalledTimes(1));
    expect(insertChannelSyncLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", unitId: "u1", channel: "airbnb", status: "error" }),
    );
  });

  it("NÃO grava quando ainda há tentativas restantes (retry automático cuida disso)", () => {
    const worker = buildFakeWorker();
    const insertChannelSyncLog = vi.fn(async () => undefined);
    registerChannelSyncDlq(worker, { insertChannelSyncLog });

    const job: DlqJobLike = { data: buildPayload(), attemptsMade: 2, opts: { attempts: 5 } };
    worker.emitFailed(job, new Error("falha transitória"));

    expect(insertChannelSyncLog).not.toHaveBeenCalled();
  });

  it("loga erro (sem lançar) quando o evento 'failed' chega sem job associado", () => {
    const worker = buildFakeWorker();
    const insertChannelSyncLog = vi.fn(async () => undefined);
    const error = vi.fn();
    registerChannelSyncDlq(worker, { insertChannelSyncLog, logger: { log: vi.fn(), error, warn: vi.fn() } });

    expect(() => worker.emitFailed(undefined, new Error("sem job"))).not.toThrow();
    expect(error).toHaveBeenCalled();
    expect(insertChannelSyncLog).not.toHaveBeenCalled();
  });
});
