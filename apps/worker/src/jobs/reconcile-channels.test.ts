import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@titan/db";
import type { Divergence } from "@titan/domain";
import type { ChannelAdapter } from "@titan/channels";
import { ChannelAdapterNotConfiguredError } from "../channel-adapter-port";
import { reconcileChannelsJob, type ReconcileChannelsListingMapping } from "./reconcile-channels";

function buildAdapter(overrides: Partial<ChannelAdapter> = {}): ChannelAdapter {
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
    reconcile: vi.fn(async (): Promise<Divergence[]> => []),
    ...overrides,
  };
}

function buildDivergence(overrides: Partial<Divergence> = {}): Divergence {
  return {
    unitId: "u1",
    channel: "airbnb",
    kind: "availability_mismatch",
    detail: { reason: "test" },
    detectedAtEpochMs: Date.UTC(2026, 6, 28),
    ...overrides,
  };
}

describe("reconcileChannelsJob", () => {
  it("chama adapter.reconcile por mapeamento e persiste divergências encontradas com o tenant correto", async () => {
    const mappings: ReconcileChannelsListingMapping[] = [
      { tenantId: "t1", unitId: "u1", channel: "airbnb" },
      { tenantId: "t2", unitId: "u2", channel: "booking" },
    ];
    const divergenceForU1 = [buildDivergence({ unitId: "u1" })];
    const adapterAirbnb = buildAdapter({ channel: "airbnb", reconcile: vi.fn(async () => divergenceForU1) });
    const adapterBooking = buildAdapter({ channel: "booking", reconcile: vi.fn(async () => []) });

    const resolveAdapter = vi.fn((channel: string) => (channel === "airbnb" ? adapterAirbnb : adapterBooking));
    const insertDivergences = vi.fn(async (_ctx: TenantContext, _divs: Divergence[]) => undefined);

    await reconcileChannelsJob({
      listAllListingMappings: async () => mappings,
      resolveAdapter,
      insertDivergences,
      now: () => Date.UTC(2026, 6, 28),
      logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
    });

    expect(adapterAirbnb.reconcile).toHaveBeenCalledWith("u1", "2026-07-28", "2026-09-26");
    expect(adapterBooking.reconcile).toHaveBeenCalledWith("u2", "2026-07-28", "2026-09-26");

    // só o mapeamento com divergências não-vazias persiste, e com o TenantContext do tenant certo.
    expect(insertDivergences).toHaveBeenCalledTimes(1);
    const [ctxArg, divsArg] = insertDivergences.mock.calls[0] as [TenantContext, Divergence[]];
    expect(ctxArg.tenantId).toBe("t1");
    expect(divsArg).toEqual(divergenceForU1);
  });

  it("pula (sem lançar) um mapeamento cujo canal não tem adapter configurado", async () => {
    const mappings: ReconcileChannelsListingMapping[] = [{ tenantId: "t1", unitId: "u1", channel: "vrbo" }];
    const resolveAdapter = vi.fn(() => {
      throw new ChannelAdapterNotConfiguredError("vrbo");
    });
    const insertDivergences = vi.fn(async () => undefined);

    await expect(
      reconcileChannelsJob({
        listAllListingMappings: async () => mappings,
        resolveAdapter,
        insertDivergences,
        now: () => Date.UTC(2026, 6, 28),
        logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
      }),
    ).resolves.toBeUndefined();

    expect(insertDivergences).not.toHaveBeenCalled();
  });

  it("captura erro de adapter.reconcile num mapeamento e continua o loop para os demais", async () => {
    const mappings: ReconcileChannelsListingMapping[] = [
      { tenantId: "t1", unitId: "u1", channel: "airbnb" },
      { tenantId: "t2", unitId: "u2", channel: "airbnb" },
    ];
    const failing = buildAdapter({
      reconcile: vi.fn().mockRejectedValueOnce(new Error("canal fora do ar")).mockResolvedValueOnce([]),
    });
    const resolveAdapter = vi.fn(() => failing);
    const insertDivergences = vi.fn(async () => undefined);

    await expect(
      reconcileChannelsJob({
        listAllListingMappings: async () => mappings,
        resolveAdapter,
        insertDivergences,
        now: () => Date.UTC(2026, 6, 28),
        logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
      }),
    ).resolves.toBeUndefined();

    expect(failing.reconcile).toHaveBeenCalledTimes(2); // o segundo mapeamento ainda foi processado.
  });
});
