// Tarifas (bounded context `rates`, seção 6 do prompt único). Zero I/O: dado um plano de tarifa
// e uma estadia, calcula o preço total como função pura. Regras de temporada/canal ficam em
// `packages/fiscal`/`packages/channels` quando essas fases abrirem — aqui só o cálculo puro por
// diária, que é o que a Fase 1 precisa para cotação/reserva.
import { scale, type Money } from "@titan/money";
import { nights, type CivilDate, type Stay } from "@titan/dates";

export interface RatePlan {
  readonly id: string;
  readonly tenantId: string;
  readonly unitId: string;
  readonly name: string;
  /** Preço por diária — seção 5.2 do prompt único: sempre Money, nunca number cru. */
  readonly nightlyPrice: Money;
  /** Estadia mínima em noites — 0 significa sem restrição. */
  readonly minStayNights: number;
  readonly validFrom: CivilDate;
  readonly validTo: CivilDate;
}

export class MinStayViolationError extends Error {
  constructor(
    public readonly requiredNights: number,
    public readonly actualNights: number,
  ) {
    super(`Estadia mínima é ${requiredNights} noites; a estadia informada tem ${actualNights}.`);
    this.name = "MinStayViolationError";
  }
}

export class RatePlanNotValidForStayError extends Error {
  constructor(ratePlanId: string) {
    super(`Plano de tarifa ${ratePlanId} não está vigente para a estadia informada.`);
    this.name = "RatePlanNotValidForStayError";
  }
}

/** O plano de tarifa cobre integralmente a estadia (checkin/checkout dentro da janela de
 * vigência)? Comparação lexicográfica funciona porque CivilDate é sempre "YYYY-MM-DD". */
export function ratePlanCoversStay(ratePlan: RatePlan, stay: Stay): boolean {
  return stay.checkin >= ratePlan.validFrom && stay.checkout <= ratePlan.validTo;
}

/**
 * Calcula o preço total de uma estadia sob um plano de tarifa — diária × número de noites.
 * Rejeita estadia abaixo do mínimo (I8-adjacent: toda decisão de preço precisa ser
 * determinística e rastreável até aqui) e estadia fora da janela de vigência do plano.
 */
export function priceStay(ratePlan: RatePlan, stay: Stay): Money {
  const n = nights(stay);
  if (ratePlan.minStayNights > 0 && n < ratePlan.minStayNights) {
    throw new MinStayViolationError(ratePlan.minStayNights, n);
  }
  if (!ratePlanCoversStay(ratePlan, stay)) {
    throw new RatePlanNotValidForStayError(ratePlan.id);
  }
  return scale(ratePlan.nightlyPrice, n);
}
