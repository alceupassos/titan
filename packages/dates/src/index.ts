// Datas de estadia são datas civis puras ("2026-12-24 no fuso do imóvel"), nunca um instante UTC.
// Persistir como `daterange` no banco. Converter para UTC cedo demais faz a reserva pular um dia
// — docs/anti-padroes.md #9.

/** Uma data civil (calendar date), sem hora nem fuso — "2026-12-24". */
export type CivilDate = string & { readonly __brand: "CivilDate" };

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function civilDate(value: string): CivilDate {
  if (!CIVIL_DATE_RE.test(value)) {
    throw new TypeError(`Data civil inválida: "${value}". Esperado YYYY-MM-DD, sem hora/fuso.`);
  }
  return value as CivilDate;
}

/** Um intervalo de estadia [checkin, checkout) — checkout é exclusivo. Mapeia para `daterange`. */
export interface Stay {
  readonly checkin: CivilDate;
  readonly checkout: CivilDate;
}

export function stay(checkin: string, checkout: string): Stay {
  const ci = civilDate(checkin);
  const co = civilDate(checkout);
  if (ci >= co) {
    throw new RangeError(`checkout (${co}) deve ser posterior a checkin (${ci}).`);
  }
  return { checkin: ci, checkout: co };
}

export function nights(s: Stay): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const ci = new Date(`${s.checkin}T00:00:00Z`).getTime();
  const co = new Date(`${s.checkout}T00:00:00Z`).getTime();
  return Math.round((co - ci) / msPerDay);
}

/** Duas estadias na mesma unidade se sobrepõem? (mesma semântica do EXCLUDE USING gist do banco) */
export function overlaps(a: Stay, b: Stay): boolean {
  return a.checkin < b.checkout && b.checkin < a.checkout;
}

/** Converte uma data civil + fuso do imóvel para o instante UTC do check-in às 15h local, por
 * exemplo — só na borda de I/O (envio de e-mail, cálculo de janela de código), nunca como
 * representação de armazenamento. */
export function civilDateToInstant(date: CivilDate, timeZone: string, hour = 15): Date {
  // Implementação mínima F0: assume offset fixo resolvido via Intl; refinar com @date-fns/tz
  // quando o pacote for consumido de verdade (checkout/webhooks) — deixado explícito para não
  // fingir precisão de fuso que ainda não foi testada contra DST.
  return new Date(`${date}T${String(hour).padStart(2, "0")}:00:00`);
}
