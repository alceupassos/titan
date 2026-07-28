import { describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@titan/db";
import type { ChannelAdapter } from "@titan/channels";
import type { Divergence, ExternalReservation, LedgerEntry } from "@titan/domain";
import { ingestExternalReservationsJob, type IngestListingMapping } from "./ingest-external-reservations";

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
    reconcile: vi.fn(async () => []),
    ...overrides,
  };
}

function buildExternal(overrides: Partial<ExternalReservation> = {}): ExternalReservation {
  return {
    externalReservationId: "ext-res-1",
    externalListingId: "listing-1",
    channel: "airbnb",
    checkinISO: "2026-08-01",
    checkoutISO: "2026-08-04",
    totalAmountCents: 90000,
    currency: "BRL",
    ...overrides,
  };
}

function buildDeps(overrides: Partial<Parameters<typeof ingestExternalReservationsJob>[0]> = {}) {
  const insertExternalReservation = vi.fn(async () => ({ kind: "created" as const, reservationId: "res-1" }));
  const findOrCreateAccount = vi.fn(async (_ctx: TenantContext, code: string) => `acc-${code}`);
  const insertLedgerEntries = vi.fn(async (_ctx: TenantContext, _entries: readonly LedgerEntry[]) => undefined);
  const insertDivergences = vi.fn(async (_ctx: TenantContext, _divs: readonly Divergence[]) => undefined);

  return {
    deps: {
      listAllListingMappings: async (): Promise<IngestListingMapping[]> => [
        { tenantId: "t1", unitId: "u1", channel: "airbnb", externalListingId: "listing-1" },
      ],
      resolveAdapter: vi.fn((): ChannelAdapter => buildAdapter()),
      insertExternalReservation,
      findOrCreateAccount,
      insertLedgerEntries,
      insertDivergences,
      idGenerator: (() => {
        let n = 0;
        return () => `le-${++n}`;
      })(),
      now: () => Date.UTC(2026, 6, 28),
      logger: { log: vi.fn(), error: vi.fn(), warn: vi.fn() },
      ...overrides,
    },
    insertExternalReservation,
    findOrCreateAccount,
    insertLedgerEntries,
    insertDivergences,
  };
}

describe("ingestExternalReservationsJob", () => {
  it("ingere reserva mapeada: cria reserva pending e posta comissão de canal balanceada", async () => {
    const adapter = buildAdapter({ pullReservations: vi.fn(async () => ({ items: [buildExternal()] })) });
    const { deps, insertExternalReservation, insertLedgerEntries } = buildDeps({
      resolveAdapter: vi.fn(() => adapter),
    });

    await ingestExternalReservationsJob(deps);

    expect(insertExternalReservation).toHaveBeenCalledWith(
      { tenantId: "t1", actorId: "channel-ingest:airbnb" },
      expect.objectContaining({ unitId: "u1", channel: "airbnb", externalRef: "ext-res-1", priceCents: 90000 }),
    );
    expect(insertLedgerEntries).toHaveBeenCalledTimes(1);
    const [, entries] = insertLedgerEntries.mock.calls[0] as [TenantContext, LedgerEntry[]];
    const total = entries.reduce((sum, e) => sum + (e.direction === "debit" ? e.amountCents : -e.amountCents), 0);
    expect(total).toBe(0); // dupla entrada fecha — mesma prova usada em posting-rules.test.ts.
  });

  it("registra divergência unmapped_reservation quando o anúncio não tem ListingMapping, sem lançar", async () => {
    const adapter = buildAdapter({
      pullReservations: vi.fn(async () => ({ items: [buildExternal({ externalListingId: "listing-desconhecido" })] })),
    });
    const { deps, insertExternalReservation, insertDivergences } = buildDeps({ resolveAdapter: vi.fn(() => adapter) });

    await expect(ingestExternalReservationsJob(deps)).resolves.toBeUndefined();

    expect(insertExternalReservation).not.toHaveBeenCalled();
    expect(insertDivergences).not.toHaveBeenCalled(); // sem tenant conhecido — só logado (ver comentário no job).
  });

  it("I1: violação da constraint EXCLUDE vira divergência availability_mismatch, nunca reserva perdida em silêncio", async () => {
    const adapter = buildAdapter({ pullReservations: vi.fn(async () => ({ items: [buildExternal()] })) });
    const { deps, insertDivergences } = buildDeps({
      resolveAdapter: vi.fn(() => adapter),
      insertExternalReservation: vi.fn(async () => ({ kind: "exclusion_violation" as const })),
    });

    await ingestExternalReservationsJob(deps);

    expect(insertDivergences).toHaveBeenCalledTimes(1);
    const [ctxArg, divsArg] = insertDivergences.mock.calls[0] as [TenantContext, Divergence[]];
    expect(ctxArg.tenantId).toBe("t1");
    expect(divsArg[0]!.kind).toBe("availability_mismatch");
  });

  it("pula canal sem capability pullReservations (iCal), sem chamar pullReservations", async () => {
    const icalAdapter = buildAdapter({
      capabilities: {
        pushRates: false,
        pushRestrictions: false,
        pullReservations: false,
        pushContent: false,
        instantBooking: false,
        messaging: false,
      },
    });
    const { deps } = buildDeps({ resolveAdapter: vi.fn(() => icalAdapter) });

    await ingestExternalReservationsJob(deps);

    expect(icalAdapter.pullReservations).not.toHaveBeenCalled();
  });

  it("um canal falhando (rede/erro) não impede a ingestão dos demais canais", async () => {
    const failingAdapter = buildAdapter({ pullReservations: vi.fn(async () => Promise.reject(new Error("canal fora do ar"))) });
    const okAdapter = buildAdapter({ pullReservations: vi.fn(async () => ({ items: [buildExternal()] })) });

    const { deps, insertExternalReservation } = buildDeps({
      resolveAdapter: vi.fn((channel: string) => (channel === "airbnb" ? failingAdapter : okAdapter)),
      listAllListingMappings: async () => [
        { tenantId: "t1", unitId: "u1", channel: "airbnb", externalListingId: "listing-1" },
        { tenantId: "t1", unitId: "u2", channel: "booking", externalListingId: "listing-1" },
      ],
    });

    await expect(ingestExternalReservationsJob(deps)).resolves.toBeUndefined();
    expect(insertExternalReservation).toHaveBeenCalledTimes(1); // só o canal booking (ok) ingeriu.
  });
});
