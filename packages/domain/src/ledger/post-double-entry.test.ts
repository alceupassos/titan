import { describe, expect, it } from "vitest";
import { NonIntegerAmountError, UnbalancedEntryError, postDoubleEntry, type LedgerLine } from "./post-double-entry";

function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

describe("I3 — postDoubleEntry recusa qualquer lançamento que não feche", () => {
  it("aceita lançamento balanceado e gera um LedgerEntry por linha", () => {
    const lines: LedgerLine[] = [
      { accountId: "acc-cash", direction: "debit", amountCents: 10000, currency: "BRL" },
      { accountId: "acc-revenue", direction: "credit", amountCents: 10000, currency: "BRL" },
    ];

    const entries = postDoubleEntry({
      tenantId: "tenant-1",
      lines,
      createdAtEpochMs: 1_700_000_000_000,
      idGenerator: idGen("le"),
    });

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ id: "le-1", tenantId: "tenant-1", accountId: "acc-cash", amountCents: 10000 });
    expect(entries[1]).toMatchObject({ id: "le-2", accountId: "acc-revenue", amountCents: 10000 });
  });

  it("REJEITA lançamento desbalanceado", () => {
    const lines: LedgerLine[] = [
      { accountId: "acc-cash", direction: "debit", amountCents: 10000, currency: "BRL" },
      { accountId: "acc-revenue", direction: "credit", amountCents: 9000, currency: "BRL" },
    ];

    expect(() =>
      postDoubleEntry({ tenantId: "tenant-1", lines, createdAtEpochMs: 0, idGenerator: idGen("le") }),
    ).toThrow(UnbalancedEntryError);
  });

  it("REJEITA quando há mais de uma moeda e uma delas não fecha (moedas nunca se somam)", () => {
    const lines: LedgerLine[] = [
      { accountId: "acc-cash-brl", direction: "debit", amountCents: 10000, currency: "BRL" },
      { accountId: "acc-revenue-brl", direction: "credit", amountCents: 10000, currency: "BRL" },
      { accountId: "acc-cash-usd", direction: "debit", amountCents: 5000, currency: "USD" },
      { accountId: "acc-revenue-usd", direction: "credit", amountCents: 4000, currency: "USD" },
    ];

    try {
      postDoubleEntry({ tenantId: "tenant-1", lines, createdAtEpochMs: 0, idGenerator: idGen("le") });
      throw new Error("deveria ter lançado UnbalancedEntryError");
    } catch (err) {
      expect(err).toBeInstanceOf(UnbalancedEntryError);
      const unbalanced = (err as UnbalancedEntryError).breakdown;
      expect(unbalanced.has("USD")).toBe(true);
      expect(unbalanced.has("BRL")).toBe(false); // BRL fechou — só USD está no relatório
    }
  });

  it("REJEITA linha com amountCents não inteiro", () => {
    const lines: LedgerLine[] = [
      { accountId: "acc-cash", direction: "debit", amountCents: 100.5, currency: "BRL" },
      { accountId: "acc-revenue", direction: "credit", amountCents: 100.5, currency: "BRL" },
    ];

    expect(() =>
      postDoubleEntry({ tenantId: "tenant-1", lines, createdAtEpochMs: 0, idGenerator: idGen("le") }),
    ).toThrow(NonIntegerAmountError);
  });

  it("propaga reservationId e reversalOfId da linha para o LedgerEntry gerado", () => {
    const lines: LedgerLine[] = [
      {
        accountId: "acc-cash",
        direction: "credit",
        amountCents: 5000,
        currency: "BRL",
        reservationId: "res-1",
        reversalOfId: "le-original-1",
      },
      { accountId: "acc-revenue", direction: "debit", amountCents: 5000, currency: "BRL", reservationId: "res-1" },
    ];

    const entries = postDoubleEntry({
      tenantId: "tenant-1",
      lines,
      createdAtEpochMs: 0,
      idGenerator: idGen("le"),
    });

    expect(entries[0]!.reservationId).toBe("res-1");
    expect(entries[0]!.reversalOfId).toBe("le-original-1");
    expect(entries[1]!.reversalOfId).toBeUndefined();
  });
});
