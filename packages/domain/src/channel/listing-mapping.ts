// Fase 3 (Distribuição) — mapeamento entre o anúncio (listing) de um canal externo (Airbnb,
// Booking, VRBO, Expedia) e a unidade real do Titan. É a base de tudo que segue neste módulo:
// sem `ListingMapping`, uma reserva/disponibilidade/tarifa vinda de canal não tem como ser
// traduzida para `unitId` — ver `external-reservation.ts` (`UnmappedListingError`).
//
// `Channel` já existe em `../reservation/state-machine` (reused aqui, nunca duplicado) — é o
// mesmo tipo que `canAcceptReservation` usa para I1, garantindo que reserva de canal passe pela
// MESMA checagem de sobreposição que reserva direta (docs/anti-padroes.md #5).
import type { Channel } from "../reservation/state-machine";

export interface ListingMapping {
  readonly id: string;
  readonly tenantId: string;
  readonly unitId: string;
  readonly channel: Channel;
  readonly externalListingId: string;
  /** epoch ms — injetado pelo chamador, nunca `Date.now()` dentro do domínio. */
  readonly createdAtEpochMs: number;
}
