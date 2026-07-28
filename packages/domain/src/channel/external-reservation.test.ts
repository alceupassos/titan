import { describe, expect, it } from "vitest";
import { mapExternalReservationToDomain, UnmappedListingError, type ExternalReservation } from "./external-reservation";
import type { ListingMapping } from "./listing-mapping";

const mapping: ListingMapping = {
  id: "mapping-1",
  tenantId: "tenant-1",
  unitId: "unit-1",
  channel: "airbnb",
  externalListingId: "airbnb-listing-42",
  createdAtEpochMs: 0,
};

const external: ExternalReservation = {
  externalReservationId: "airbnb-res-1",
  externalListingId: "airbnb-listing-42",
  channel: "airbnb",
  checkinISO: "2026-09-01",
  checkoutISO: "2026-09-05",
  guestName: "Fulano de Tal",
  totalAmountCents: 120000,
  currency: "BRL",
};

describe("mapExternalReservationToDomain — I1 para reserva de canal externo", () => {
  it("mapeia corretamente para o shape de ReservationForOverlapCheck", () => {
    const mapped = mapExternalReservationToDomain(external, mapping);

    expect(mapped.unitId).toBe("unit-1");
    expect(mapped.stay).toEqual({ checkin: "2026-09-01", checkout: "2026-09-05" });
    expect(mapped.channel).toBe("airbnb");
    expect(mapped.externalRef).toBe("airbnb-res-1");
    expect(mapped.priceAmount).toEqual({ amountCents: 120000, currency: "BRL" });
  });

  it("status é sempre 'pending', nunca 'confirmed' direto", () => {
    const mapped = mapExternalReservationToDomain(external, mapping);

    expect(mapped.status).toBe("pending");
  });

  it("lança UnmappedListingError quando o mapping não bate com o externalListingId recebido", () => {
    const wrongMapping: ListingMapping = { ...mapping, externalListingId: "outro-listing" };

    expect(() => mapExternalReservationToDomain(external, wrongMapping)).toThrow(UnmappedListingError);
  });
});
