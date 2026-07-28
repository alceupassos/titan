// PROVA DO PORTÃO DE SAÍDA DA FASE 5 (docs/roadmap.md: "DRE fecha ao centavo vs. extrato
// simulado") — em memória, SEM Postgres. Monta um ciclo completo reserva -> pagamento -> repasse
// usando só o que já existe em `packages/domain` (zero I/O), soma os lançamentos resultantes
// agrupados por conta com a MESMA regra de normalização de dupla entrada usada pela borda de
// leitura real (`apps/console/app/(staff)/financeiro/dre/queries.ts` — não importada aqui de
// propósito: `packages/domain` não depende de `apps/console`; a regra é replicada localmente e
// comentada como tal, não uma cópia acidental que possa divergir em silêncio) e confere contra um
// "extrato simulado" calculado de forma independente dentro do próprio teste.
//
// Cenário: 1 reserva direta de 1 diária de R$ 1.000,00 (100000 centavos), paga por gateway com
// taxa de 3% (R$ 30,00 = 3000 centavos). Titan é o merchant of record (regime "hospedagem com
// serviços", default assumido em docs/decisoes-de-negocio.md #1 enquanto pendente) — reconhece a
// RECEITA BRUTA e contabiliza tanto a taxa de gateway quanto o repasse líquido ao proprietário
// como DESPESA; o resultado líquido (receita - despesa) é a margem/comissão implícita da Titan.
// Proprietário recebe 80% do bruto (R$ 800,00 = 80000 centavos) — os 20% restantes menos a taxa
// de gateway (100000 - 3000 - 80000 = 17000 centavos = R$ 170,00) são a margem da Titan.
import { describe, expect, it } from "vitest";
import { postDoubleEntry, type LedgerLine } from "./post-double-entry";
import type { LedgerEntry } from "./ledger-entry";
import { entriesForPaymentCaptured, entriesForPayoutSettlement } from "./posting-rules";

function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

// Plano de contas mínimo do cenário — mesma forma de `packages/db/src/schema/account.ts`
// (`code`/`name`/`kind`), só que em memória (sem `withTenant`/Postgres).
type AccountKind = "asset" | "liability" | "equity" | "revenue" | "expense";
interface TestAccount {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: AccountKind;
}

const CASH: TestAccount = { id: "acc-cash", code: "1.1.01", name: "Caixa", kind: "asset" };
const UNIT_REVENUE: TestAccount = {
  id: "acc-unit-revenue",
  code: "4.1.01",
  name: "Receita de hospedagem",
  kind: "revenue",
};
const GATEWAY_FEE_EXPENSE: TestAccount = {
  id: "acc-gateway-fee",
  code: "5.1.01",
  name: "Taxa de gateway",
  kind: "expense",
};
const OWNER_PAYOUT_EXPENSE: TestAccount = {
  id: "acc-owner-payout-expense",
  code: "5.2.01",
  name: "Repasse a proprietário (custo)",
  kind: "expense",
};
const PAYOUT_LIABILITY: TestAccount = {
  id: "acc-payout-liability",
  code: "2.1.01",
  name: "Repasse a proprietário a pagar",
  kind: "liability",
};

const ACCOUNTS_BY_ID = new Map<string, TestAccount>(
  [CASH, UNIT_REVENUE, GATEWAY_FEE_EXPENSE, OWNER_PAYOUT_EXPENSE, PAYOUT_LIABILITY].map((a) => [a.id, a]),
);

/** Replica, EM MEMÓRIA, a mesma regra de normalização de
 * `apps/console/app/(staff)/financeiro/dre/queries.ts`: receita cresce no crédito, despesa cresce
 * no débito; ativo/passivo/patrimônio ficam fora do DRE gerencial simplificado (são balanço, não
 * resultado). Documentada aqui de novo (não importada) porque `packages/domain` não pode depender
 * de `apps/console` — ver cabeçalho do arquivo. */
function aggregateForDre(entries: readonly LedgerEntry[]): {
  totalRevenueCents: number;
  totalExpenseCents: number;
  netResultCents: number;
  byAccountCode: Map<string, number>;
} {
  const byAccountCode = new Map<string, number>();
  let totalRevenueCents = 0;
  let totalExpenseCents = 0;

  for (const entry of entries) {
    const account = ACCOUNTS_BY_ID.get(entry.accountId);
    if (!account) {
      throw new Error(`Conta desconhecida no cenário de teste: ${entry.accountId}`);
    }
    if (account.kind !== "revenue" && account.kind !== "expense") {
      continue; // ativo/passivo — fora do DRE, ver comentário da função.
    }
    const delta =
      account.kind === "revenue"
        ? entry.direction === "credit"
          ? entry.amountCents
          : -entry.amountCents
        : entry.direction === "debit"
          ? entry.amountCents
          : -entry.amountCents;

    byAccountCode.set(account.code, (byAccountCode.get(account.code) ?? 0) + delta);
    if (account.kind === "revenue") {
      totalRevenueCents += delta;
    } else {
      totalExpenseCents += delta;
    }
  }

  return { totalRevenueCents, totalExpenseCents, netResultCents: totalRevenueCents - totalExpenseCents, byAccountCode };
}

describe("DRE fecha ao centavo vs. extrato simulado (portão de saída da Fase 5)", () => {
  it("reserva confirmada -> pagamento capturado -> repasse liquidado: DRE bate com o cálculo independente", () => {
    const reservationId = "res-dre-1";
    const grossAmountCents = 100_000; // R$ 1.000,00 — diária única, preço conhecido do cenário.
    const gatewayFeeAmountCents = 3_000; // R$ 30,00 (3%).
    const ownerPayoutCents = 80_000; // R$ 800,00 (80% do bruto) — repasse líquido ao proprietário.

    // 1) Reserva confirmada com preço conhecido + pagamento capturado (I2).
    const capturedLines = entriesForPaymentCaptured({
      reservationId,
      unitRevenueAccountId: UNIT_REVENUE.id,
      cashAccountId: CASH.id,
      gatewayFeeExpenseAccountId: GATEWAY_FEE_EXPENSE.id,
      grossAmountCents,
      gatewayFeeAmountCents,
      currency: "BRL",
    });
    const capturedEntries = postDoubleEntry({
      tenantId: "tenant-dre-test",
      lines: capturedLines,
      createdAtEpochMs: 0,
      idGenerator: idGen("le-captured"),
    });

    // 2) Provisiona o passivo de repasse ao proprietário (débito na despesa de repasse, crédito no
    // passivo) — `entriesForPayoutSettlement` assume EXPLICITAMENTE que este passivo já foi
    // provisionado em algum lançamento anterior (ver comentário de
    // `EntriesForPayoutSettlementParams` em ./posting-rules.ts); não existe ainda nenhuma posting
    // rule exportada para essa provisão (fica para quando o worker de repasse da Fase 5 precisar
    // dela de verdade), então este teste monta a linha manualmente com `LedgerLine[]` cru — não é
    // um atalho por fora de `postDoubleEntry`, passa pela MESMA função de validação/materialização
    // que qualquer posting rule real usaria.
    const provisionLines: LedgerLine[] = [
      {
        accountId: OWNER_PAYOUT_EXPENSE.id,
        direction: "debit",
        amountCents: ownerPayoutCents,
        currency: "BRL",
        reservationId,
      },
      {
        accountId: PAYOUT_LIABILITY.id,
        direction: "credit",
        amountCents: ownerPayoutCents,
        currency: "BRL",
        reservationId,
      },
    ];
    const provisionEntries = postDoubleEntry({
      tenantId: "tenant-dre-test",
      lines: provisionLines,
      createdAtEpochMs: 1,
      idGenerator: idGen("le-provision"),
    });

    // 3) Baixa (settlement) do repasse — dinheiro efetivamente saindo para o proprietário.
    const settlementLines = entriesForPayoutSettlement({
      reservationId,
      payoutLiabilityAccountId: PAYOUT_LIABILITY.id,
      cashAccountId: CASH.id,
      netPayoutCents: ownerPayoutCents,
      currency: "BRL",
    });
    const settlementEntries = postDoubleEntry({
      tenantId: "tenant-dre-test",
      lines: settlementLines,
      createdAtEpochMs: 2,
      idGenerator: idGen("le-settlement"),
    });

    // Todas as três chamadas de `postDoubleEntry` acima já são, sozinhas, a prova de que CADA
    // conjunto fecha (débito == crédito por moeda) — `postDoubleEntry` teria lançado
    // `UnbalancedEntryError` caso contrário. O que falta provar é o PORTÃO DA FASE: que a soma de
    // TODOS os lançamentos do ciclo, agrupada por conta pela regra de dupla entrada, bate ao
    // centavo com um cálculo feito de forma totalmente independente.
    const allEntries: LedgerEntry[] = [...capturedEntries, ...provisionEntries, ...settlementEntries];
    expect(allEntries).toHaveLength(3 + 2 + 2);

    const dre = aggregateForDre(allEntries);

    // Extrato simulado — calculado à parte, sem reaproveitar nenhuma variável intermediária do
    // agrupamento acima, só os três números conhecidos do cenário.
    const expectedTotalRevenueCents = grossAmountCents; // só uma linha de receita no cenário.
    const expectedTotalExpenseCents = gatewayFeeAmountCents + ownerPayoutCents;
    const expectedNetResultCents = grossAmountCents - gatewayFeeAmountCents - ownerPayoutCents;

    expect(dre.totalRevenueCents).toBe(expectedTotalRevenueCents);
    expect(dre.totalExpenseCents).toBe(expectedTotalExpenseCents);
    expect(dre.netResultCents).toBe(expectedNetResultCents);
    expect(dre.netResultCents).toBe(17_000); // R$ 170,00 — conferência literal do cenário descrito no cabeçalho.

    // Por conta: receita só na conta de receita de hospedagem, pelo bruto; despesa dividida entre
    // taxa de gateway e repasse; ativo (caixa) e passivo (repasse a pagar) não entram no DRE.
    expect(dre.byAccountCode.get(UNIT_REVENUE.code)).toBe(grossAmountCents);
    expect(dre.byAccountCode.get(GATEWAY_FEE_EXPENSE.code)).toBe(gatewayFeeAmountCents);
    expect(dre.byAccountCode.get(OWNER_PAYOUT_EXPENSE.code)).toBe(ownerPayoutCents);
    expect(dre.byAccountCode.has(CASH.code)).toBe(false);
    expect(dre.byAccountCode.has(PAYOUT_LIABILITY.code)).toBe(false);

    // Confirma também que o CAIXA fechou corretamente ao longo do ciclo inteiro (não é o foco do
    // DRE, mas é a garantia complementar de que o cenário é financeiramente consistente de ponta a
    // ponta): entrou o líquido do pagamento (bruto - taxa), saiu o repasse ao proprietário.
    const cashEntries = allEntries.filter((e) => e.accountId === CASH.id);
    const cashBalanceCents = cashEntries.reduce(
      (sum, e) => sum + (e.direction === "debit" ? e.amountCents : -e.amountCents),
      0,
    );
    expect(cashBalanceCents).toBe(grossAmountCents - gatewayFeeAmountCents - ownerPayoutCents);
  });
});
