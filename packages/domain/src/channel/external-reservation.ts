// Fase 3 — I1 para reserva de canal externo. `mapExternalReservationToDomain` traduz o shape
// mínimo que chega de um canal (Airbnb, Booking, VRBO, Expedia) para o mesmo
// `ReservationForOverlapCheck` que `canAcceptReservation` usa para reserva direta — não existe
// caminho separado de validação de sobreposição por canal (docs/anti-padroes.md #5: "if canal ==
// 'airbnb' espalhado no domínio em vez de adapters").
import { money, type CurrencyCode, type Money } from "@titan/money";
import { stay } from "@titan/dates";
import type { Channel, ReservationForOverlapCheck } from "../reservation/state-machine";
import type { Cents } from "../ledger/ledger-entry";
import type { ListingMapping } from "./listing-mapping";

export interface ExternalReservation {
  readonly externalReservationId: string;
  readonly externalListingId: string;
  readonly channel: Channel;
  readonly checkinISO: string;
  readonly checkoutISO: string;
  readonly guestName?: string;
  /** Centavos inteiros — mesmo significado de `Money.amountCents`. Tipado como `Cents` (não
   * `number` solto) para não disparar o hook `block-money-float.mjs` por engano E para deixar
   * explícito, no shape que chega do canal externo, que este valor já é inteiro em centavos. */
  readonly totalAmountCents: Cents;
  readonly currency: CurrencyCode;
}

/** Lançado quando não há `ListingMapping` para o `externalListingId` recebido — sem mapeamento
 * não há como saber a qual `unitId` a reserva externa pertence. */
export class UnmappedListingError extends Error {
  constructor(externalListingId: string, channel: Channel) {
    super(
      `Nenhum ListingMapping encontrado para o anúncio "${externalListingId}" no canal "${channel}" — ` +
        "não é possível determinar a unidade correspondente.",
    );
    this.name = "UnmappedListingError";
  }
}

/**
 * Traduz uma reserva vinda de um canal externo para o shape compatível com `canAcceptReservation`
 * (I1). Toda reserva externa entra sempre como `status: "pending"` — nunca `confirmed` direto —
 * até passar pela reconciliação/confirmação (Passo 5, fora de escopo aqui).
 *
 * O `mapping` é passado pelo chamador (que já buscou o `ListingMapping` certo para este
 * `externalListingId` antes de chamar esta função); a checagem `mapping.externalListingId !==
 * external.externalListingId` aqui é só uma checagem de sanidade contra o chamador ter passado o
 * mapping errado, não a busca do mapping em si.
 */
export function mapExternalReservationToDomain(
  external: ExternalReservation,
  mapping: ListingMapping,
): ReservationForOverlapCheck & { readonly channel: Channel; readonly externalRef: string; readonly priceAmount: Money } {
  if (mapping.externalListingId !== external.externalListingId) {
    throw new UnmappedListingError(external.externalListingId, external.channel);
  }

  const reservationStay = stay(external.checkinISO, external.checkoutISO);

  return {
    unitId: mapping.unitId,
    stay: reservationStay,
    status: "pending",
    channel: external.channel,
    externalRef: external.externalReservationId,
    priceAmount: money(external.totalAmountCents, external.currency),
  };
}
