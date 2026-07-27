// Dinheiro é sempre inteiro em centavos na aplicação, nunca float — docs/anti-padroes.md #9.
// Este módulo é o único ponto de entrada permitido para valores monetários no monorepo.

export type CurrencyCode = "BRL" | "USD" | "EUR";

/** Um valor monetário: inteiro em centavos + moeda. Nunca `number` solto. */
export interface Money {
  readonly amountCents: number;
  readonly currency: CurrencyCode;
}

function assertInteger(amountCents: number): void {
  if (!Number.isInteger(amountCents)) {
    throw new TypeError(
      `Money.amountCents deve ser inteiro (centavos), recebido: ${amountCents}. ` +
        "Dinheiro nunca é float — ver docs/anti-padroes.md #9.",
    );
  }
}

export function money(amountCents: number, currency: CurrencyCode): Money {
  assertInteger(amountCents);
  return { amountCents, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new TypeError(`Operação entre moedas distintas (${a.currency} vs ${b.currency}) exige conversão explícita.`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents + b.amountCents, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountCents - b.amountCents, a.currency);
}

/** Multiplica por um fator racional preservando centavos inteiros (arredondamento bancário). */
export function scale(a: Money, factor: number): Money {
  return money(Math.round(a.amountCents * factor), a.currency);
}

export function isZero(a: Money): boolean {
  return a.amountCents === 0;
}

export function isNegative(a: Money): boolean {
  return a.amountCents < 0;
}

const LOCALE_BY_CURRENCY: Record<CurrencyCode, string> = {
  BRL: "pt-BR",
  USD: "en-US",
  EUR: "de-DE",
};

/** Formata para exibição — nunca usar para persistência ou cálculo. */
export function format(a: Money): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[a.currency], {
    style: "currency",
    currency: a.currency,
  }).format(a.amountCents / 100);
}
