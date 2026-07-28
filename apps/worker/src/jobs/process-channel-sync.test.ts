import { describe, expect, it, vi } from "vitest";
import type { AvailabilitySnapshot, RateSnapshot } from "@titan/domain";
import { money } from "@titan/money";
import type { ChannelAdapter } from "@titan/channels";
import { ChannelAdapterNotConfiguredError } from "../channel-adapter-port";
import type { ChannelSyncJobPayload } from "../channel-queue";
import type { ChannelSyncLogEntryInput, ChannelSyncRepo } from "../channel-sync-repo";
import { processChannelSyncJob } from "./process-channel-sync";

/**
 * Testes de `processChannelSyncJob` — sem BullMQ/Postgres reais (mesmo espírito de
 * `jobs/process-webhook.test.ts`): `repo`/`resolveAdapter` são fakes em memória.
 */

function buildPayload(overrides: Partial<ChannelSyncJobPayload> = {}): ChannelSyncJobPayload {
  return { tenantId: "t1", unitId: "u1", channel: "airbnb", kind: "availability", ...overrides };
}

function buildFakeRepo(overrides: Partial<ChannelSyncRepo> = {}): { repo: ChannelSyncRepo; logEntries: ChannelSyncLogEntryInput[] } {
  const logEntries: ChannelSyncLogEntryInput[] = [];
  const repo: ChannelSyncRepo = {
    buildAvailabilitySnapshot: vi.fn(async (_ctx, unitId): Promise<AvailabilitySnapshot[]> => [
      { unitId, date: "2026-07-28" as never, blocked: true },
    ]),
    buildRateSnapshot: vi.fn(async (_ctx, unitId): Promise<RateSnapshot[]> => [
      { unitId, date: "2026-07-28" as never, priceAmount: money(20000, "BRL") },
    ]),
    insertChannelSyncLog: vi.fn(async (_ctx, entry) => {
      logEntries.push(entry);
    }),
    insertDivergences: vi.fn(async () => undefined),
    ...overrides,
  };
  return { repo, logEntries };
}

function buildFakeAdapter(overrides: Partial<ChannelAdapter> = {}): ChannelAdapter {
  return {
    channel: "airbnb",
    capabilities: {
      pushRates: true,
      pushRestrictions: false,
      pullReservations: true,
      pushContent: false,
      instantBooking: false,
      messaging: false,
    },
    syncContent: vi.fn(async () => ({ externalListingId: "ext-1", ok: true })),
    pushAvailability: vi.fn(async () => ({ ok: true })),
    pushRates: vi.fn(async () => ({ ok: true })),
    pullReservations: vi.fn(async () => ({ items: [] })),
    handleWebhook: vi.fn(async () => []),
    reconcile: vi.fn(async () => []),
    ...overrides,
  };
}

describe("processChannelSyncJob — adapter não configurado", () => {
  it("grava channel_sync_log de erro e relança para o BullMQ decidir retry/DLQ", async () => {
    const { repo, logEntries } = buildFakeRepo();
    const resolveAdapter = vi.fn(() => {
      throw new ChannelAdapterNotConfiguredError("airbnb");
    });

    await expect(
      processChannelSyncJob(buildPayload(), { resolveAdapter, repo, now: () => Date.UTC(2026, 6, 28), logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() } }),
    ).rejects.toThrow(ChannelAdapterNotConfiguredError);

    expect(logEntries).toEqual([
      expect.objectContaining({ status: "error", detail: expect.objectContaining({ reason: "adapter_not_configured" }) }),
    ]);
  });
});

describe("processChannelSyncJob — kind: availability", () => {
  it("busca o snapshot de disponibilidade, chama pushAvailability e grava log ok", async () => {
    const { repo, logEntries } = buildFakeRepo();
    const adapter = buildFakeAdapter();
    const resolveAdapter = vi.fn(() => adapter);

    await processChannelSyncJob(buildPayload({ kind: "availability" }), {
      resolveAdapter,
      repo,
      now: () => Date.UTC(2026, 6, 28),
      logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
    });

    expect(repo.buildAvailabilitySnapshot).toHaveBeenCalledWith(
      { tenantId: "t1", actorId: "channel-sync:airbnb" },
      "u1",
      "2026-07-28",
      60,
    );
    expect(adapter.pushAvailability).toHaveBeenCalledWith("u1", [{ unitId: "u1", date: "2026-07-28", blocked: true }]);
    expect(adapter.pushRates).not.toHaveBeenCalled();
    expect(logEntries).toEqual([expect.objectContaining({ status: "ok", detail: { kind: "availability" } })]);
  });
});

describe("processChannelSyncJob — kind: rates", () => {
  it("busca o snapshot de tarifa, chama pushRates e grava log ok", async () => {
    const { repo, logEntries } = buildFakeRepo();
    const adapter = buildFakeAdapter();
    const resolveAdapter = vi.fn(() => adapter);

    await processChannelSyncJob(buildPayload({ kind: "rates" }), {
      resolveAdapter,
      repo,
      now: () => Date.UTC(2026, 6, 28),
      logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
    });

    expect(repo.buildRateSnapshot).toHaveBeenCalled();
    expect(adapter.pushRates).toHaveBeenCalledWith("u1", [
      { unitId: "u1", date: "2026-07-28", priceAmount: money(20000, "BRL") },
    ]);
    expect(adapter.pushAvailability).not.toHaveBeenCalled();
    expect(logEntries).toEqual([expect.objectContaining({ status: "ok", detail: { kind: "rates" } })]);
  });
});

describe("processChannelSyncJob — push falha", () => {
  it("grava channel_sync_log de erro e relança quando o adapter lança", async () => {
    const { repo, logEntries } = buildFakeRepo();
    const adapter = buildFakeAdapter({
      pushAvailability: vi.fn(async () => {
        throw new Error("timeout de rede");
      }),
    });
    const resolveAdapter = vi.fn(() => adapter);

    await expect(
      processChannelSyncJob(buildPayload({ kind: "availability" }), {
        resolveAdapter,
        repo,
        now: () => Date.UTC(2026, 6, 28),
        logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
      }),
    ).rejects.toThrow("timeout de rede");

    expect(logEntries).toEqual([
      expect.objectContaining({ status: "error", detail: expect.objectContaining({ kind: "availability", error: "timeout de rede" }) }),
    ]);
  });
});
