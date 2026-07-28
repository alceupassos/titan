// I3 — Todo lançamento financeiro é imutável; correção por lançamento de estorno. `postDoubleEntry`
// é o ÚNICO ponto de criação de `LedgerEntry` neste pacote: dado um conjunto de linhas (débito e
// crédito ainda sem id/timestamp), recusa qualquer conjunto que não feche — soma de débito ==
// soma de crédito, agrupado por moeda (nunca soma BRL com USD como se fossem a mesma coisa).
//
// Assinatura escolhida: `postDoubleEntry(params)` com um único objeto de parâmetros (mesmo estilo
// de `createQuote`/`CreateQuoteParams` em packages/domain/src/quote/quote.ts) — `tenantId` vive no
// nível da chamada (não por linha) porque um único lançamento de dupla entrada nunca atravessa
// tenant; `idGenerator`/`createdAtEpochMs` são injetados pelo chamador (zero I/O, mesmo padrão de
// `HashFn` em packages/domain/src/evidence/chain.ts).
import type { CurrencyCode } from "@titan/money";
import type { Cents, LedgerDirection, LedgerEntry } from "./ledger-entry";

export interface LedgerLine {
  readonly accountId: string;
  readonly direction: LedgerDirection;
  readonly amountCents: Cents;
  readonly currency: CurrencyCode;
  readonly reservationId?: string;
  /** Presente só quando esta linha é a contrapartida de estorno de um lançamento original — vira
   * `reversalOfId` no `LedgerEntry` gerado (I3). Extensão além do shape mínimo sugerido, necessária
   * para `entriesForRefund` conseguir referenciar, linha a linha, qual lançamento original cada
   * linha de estorno corrige (o débito de caixa original e o crédito de receita original têm ids
   * diferentes). */
  readonly reversalOfId?: string;
}

interface CurrencyTotals {
  debitCents: number;
  creditCents: number;
}

export class UnbalancedEntryError extends Error {
  constructor(public readonly breakdown: ReadonlyMap<CurrencyCode, CurrencyTotals>) {
    const detail = [...breakdown.entries()]
      .map(([currency, t]) => `${currency}: débito ${t.debitCents} vs crédito ${t.creditCents}`)
      .join("; ");
    super(
      `Lançamento desbalanceado (I3 — todo lançamento precisa fechar por moeda, nunca somar ` +
        `moedas diferentes como se fossem uma só): ${detail}`,
    );
    this.name = "UnbalancedEntryError";
  }
}

export class NonIntegerAmountError extends TypeError {
  constructor(accountId: string, amountCents: Cents) {
    super(
      `Linha de lançamento para a conta ${accountId} tem amountCents não inteiro (${amountCents}). ` +
        "Centavos são sempre inteiros — docs/anti-padroes.md #9.",
    );
    this.name = "NonIntegerAmountError";
  }
}

export interface PostDoubleEntryParams {
  readonly tenantId: string;
  readonly lines: readonly LedgerLine[];
  readonly createdAtEpochMs: number;
  readonly idGenerator: () => string;
}

/**
 * Materializa `LedgerLine[]` em `LedgerEntry[]` — recusa (lança `UnbalancedEntryError`) qualquer
 * conjunto cuja soma de débitos difira da soma de créditos em QUALQUER moeda presente. Cada moeda
 * fecha independentemente; não existe conversão implícita aqui.
 */
export function postDoubleEntry(params: PostDoubleEntryParams): LedgerEntry[] {
  const { tenantId, lines, createdAtEpochMs, idGenerator } = params;

  for (const line of lines) {
    if (!Number.isInteger(line.amountCents)) {
      throw new NonIntegerAmountError(line.accountId, line.amountCents);
    }
  }

  const totalsByCurrency = new Map<CurrencyCode, CurrencyTotals>();
  for (const line of lines) {
    const totals = totalsByCurrency.get(line.currency) ?? { debitCents: 0, creditCents: 0 };
    if (line.direction === "debit") {
      totals.debitCents += line.amountCents;
    } else {
      totals.creditCents += line.amountCents;
    }
    totalsByCurrency.set(line.currency, totals);
  }

  const unbalanced = new Map(
    [...totalsByCurrency.entries()].filter(([, t]) => t.debitCents !== t.creditCents),
  );
  if (unbalanced.size > 0) {
    throw new UnbalancedEntryError(unbalanced);
  }

  return lines.map((line) => ({
    id: idGenerator(),
    tenantId,
    accountId: line.accountId,
    direction: line.direction,
    amountCents: line.amountCents,
    currency: line.currency,
    createdAt: createdAtEpochMs,
    ...(line.reservationId !== undefined ? { reservationId: line.reservationId } : {}),
    ...(line.reversalOfId !== undefined ? { reversalOfId: line.reversalOfId } : {}),
  }));
}
