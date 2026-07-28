import { describe, expect, it } from "vitest";
import { civilDate } from "@titan/dates";
import { money } from "@titan/money";
import {
  detectAvailabilityDrift,
  detectRateDrift,
  type AvailabilitySnapshot,
  type RateSnapshot,
} from "./reconciliation";

describe("detectAvailabilityDrift — I1 aplicado à reconciliação de disponibilidade por canal", () => {
  it("snapshots idênticos → zero divergência", () => {
    const local: AvailabilitySnapshot[] = [
      { unitId: "unit-1", date: civilDate("2026-08-01"), blocked: true },
      { unitId: "unit-1", date: civilDate("2026-08-02"), blocked: false },
    ];
    const remote: AvailabilitySnapshot[] = [
      { unitId: "unit-1", date: civilDate("2026-08-01"), blocked: true },
      { unitId: "unit-1", date: civilDate("2026-08-02"), blocked: false },
    ];

    const divergences = detectAvailabilityDrift(local, remote, { channel: "airbnb", nowEpochMs: 0 });

    expect(divergences).toHaveLength(0);
  });

  it("um dia com `blocked` diferente → exatamente 1 divergência", () => {
    const local: AvailabilitySnapshot[] = [
      { unitId: "unit-1", date: civilDate("2026-08-01"), blocked: true },
      { unitId: "unit-1", date: civilDate("2026-08-02"), blocked: false },
    ];
    const remote: AvailabilitySnapshot[] = [
      { unitId: "unit-1", date: civilDate("2026-08-01"), blocked: false },
      { unitId: "unit-1", date: civilDate("2026-08-02"), blocked: false },
    ];

    const divergences = detectAvailabilityDrift(local, remote, { channel: "airbnb", nowEpochMs: 1000 });

    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({
      unitId: "unit-1",
      channel: "airbnb",
      kind: "availability_mismatch",
      date: "2026-08-01",
      detectedAtEpochMs: 1000,
    });
  });

  it("data ausente de um lado → divergência (não é tratada como igual)", () => {
    const local: AvailabilitySnapshot[] = [{ unitId: "unit-1", date: civilDate("2026-08-01"), blocked: true }];
    const remote: AvailabilitySnapshot[] = [];

    const divergences = detectAvailabilityDrift(local, remote, { channel: "booking", nowEpochMs: 0 });

    expect(divergences).toHaveLength(1);
    expect(divergences[0]!.kind).toBe("availability_mismatch");
    expect(divergences[0]!.detail).toMatchObject({ reason: "missing_on_one_side", missingSide: "remote" });
  });
});

describe("detectRateDrift — divergência de tarifa por canal", () => {
  it("snapshots idênticos → zero divergência", () => {
    const local: RateSnapshot[] = [{ unitId: "unit-1", date: civilDate("2026-08-01"), priceAmount: money(50000, "BRL") }];
    const remote: RateSnapshot[] = [{ unitId: "unit-1", date: civilDate("2026-08-01"), priceAmount: money(50000, "BRL") }];

    expect(detectRateDrift(local, remote, { channel: "vrbo", nowEpochMs: 0 })).toHaveLength(0);
  });

  it("um dia com valor diferente → exatamente 1 divergência", () => {
    const local: RateSnapshot[] = [{ unitId: "unit-1", date: civilDate("2026-08-01"), priceAmount: money(50000, "BRL") }];
    const remote: RateSnapshot[] = [{ unitId: "unit-1", date: civilDate("2026-08-01"), priceAmount: money(45000, "BRL") }];

    const divergences = detectRateDrift(local, remote, { channel: "vrbo", nowEpochMs: 0 });

    expect(divergences).toHaveLength(1);
    expect(divergences[0]).toMatchObject({ kind: "rate_mismatch", unitId: "unit-1", channel: "vrbo" });
  });

  it("moeda divergente conta como divergência mesmo com o mesmo amountCents", () => {
    const local: RateSnapshot[] = [{ unitId: "unit-1", date: civilDate("2026-08-01"), priceAmount: money(50000, "BRL") }];
    const remote: RateSnapshot[] = [{ unitId: "unit-1", date: civilDate("2026-08-01"), priceAmount: money(50000, "USD") }];

    const divergences = detectRateDrift(local, remote, { channel: "expedia", nowEpochMs: 0 });

    expect(divergences).toHaveLength(1);
    expect(divergences[0]!.detail).toMatchObject({ localCurrency: "BRL", remoteCurrency: "USD" });
  });

  it("data ausente de um lado → divergência", () => {
    const local: RateSnapshot[] = [{ unitId: "unit-1", date: civilDate("2026-08-01"), priceAmount: money(50000, "BRL") }];
    const remote: RateSnapshot[] = [];

    const divergences = detectRateDrift(local, remote, { channel: "expedia", nowEpochMs: 0 });

    expect(divergences).toHaveLength(1);
    expect(divergences[0]!.detail).toMatchObject({ reason: "missing_on_one_side" });
  });
});
