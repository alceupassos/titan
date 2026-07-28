// DRE (Demonstração de Resultado) gerencial simplificado — Fase 5 (Financeiro), Passo 4d
// (docs/fase-atual.md). Portão de saída OFICIAL da fase inteira (docs/roadmap.md): "DRE fecha ao
// centavo vs. extrato simulado". A prova em memória disso (sem Postgres) vive em
// packages/domain/src/ledger/dre-reconciliation.test.ts; este arquivo é a borda de leitura que
// aplica a MESMA lógica de normalização de dupla entrada contra o banco real, via `withTenant`.
//
// REGRA DE NORMALIZAÇÃO (documentar sempre que alguém for ler/mexer aqui — contabilidade de dupla
// entrada não tem "sinal cru"): uma conta de RECEITA (`kind === 'revenue'`) cresce no CRÉDITO —
// então cada linha soma `+amountCents` se `direction === 'credit'`, `-amountCents` se `direction
// === 'debit'` (ex.: um estorno de receita, que é lançado como débito — ver `entriesForRefund`,
// packages/domain/src/ledger/posting-rules.ts). Uma conta de DESPESA (`kind === 'expense'`) cresce
// no DÉBITO — o inverso. Contas de ativo/passivo/patrimônio (`asset`/`liability`/`equity`) NÃO
// entram neste DRE gerencial simplificado — são contas de balanço, não de resultado; qualquer
// lançamento nelas (caixa, recebível de canal, passivo de repasse) é ignorado aqui por desenho, não
// por omissão.
//
// LIMITAÇÃO DOCUMENTADA (filtro por unidade): `ledger_entries` não carrega `unit_id` direto — só
// `reservation_id` (nullable). Para filtrar por unidade, fazemos um JOIN até `reservations` e
// mantemos só os lançamentos cujo `reservation_id` aponta para uma reserva daquela unidade.
// Lançamentos SEM `reservation_id` (ex.: baixa de repasse consolidada de várias reservas do
// período — `entriesForPayoutSettlement`, mesmo arquivo de posting rules, ver comentário do
// próprio `EntriesForPayoutSettlementParams`) NUNCA entram no total "por unidade" — não há como
// atribuí-los a uma unidade sem ambiguidade. Isto é "melhor esforço" documentado, não bloqueante:
// o relatório "carteira" (sem `unitId`) sempre inclui TODOS os lançamentos do período,
// independentemente de terem ou não `reservation_id`.
import { and, eq, gte, lt } from "drizzle-orm";
import { accounts, ledgerEntries, reservations, units, withTenant } from "@titan/db";
import type { Cents } from "@titan/domain";

export interface DreLine {
  readonly accountCode: string;
  readonly accountName: string;
  readonly kind: string;
  readonly totalCents: Cents;
}

export interface DreReport {
  readonly periodStartISO: string;
  readonly periodEndISO: string;
  readonly revenueLines: DreLine[];
  readonly expenseLines: DreLine[];
  readonly totalRevenueCents: Cents;
  readonly totalExpenseCents: Cents;
  /** revenue - expense */
  readonly netResultCents: Cents;
}

export interface ComputeDreForPeriodParams {
  readonly tenantId: string;
  /** Obrigatório por `withTenant` (docs/adr/0007) — toda query tenant-scoped é atribuível a um
   * ator; não faz parte do shape pedido originalmente, mas não há como abrir uma transação
   * `withTenant` sem ele. */
  readonly actorId: string;
  readonly periodStartISO: string;
  /** Limite superior EXCLUSIVO (mesma convenção half-open já usada para `stay daterange` em
   * `packages/db/src/schema/reservation.ts`) — um lançamento criado exatamente neste instante
   * NÃO entra no período. O chamador (página) é responsável por somar +1 dia à data final
   * escolhida pelo usuário (inclusiva do ponto de vista humano) antes de passar aqui. */
  readonly periodEndISO: string;
  readonly unitId?: string;
}

interface RawLedgerRow {
  accountCode: string;
  accountName: string;
  kind: string;
  direction: string;
  amountCents: Cents;
  reservationId: string | null;
}

function normalizedAmountCents(row: RawLedgerRow): Cents {
  if (row.kind === "revenue") {
    return row.direction === "credit" ? row.amountCents : -row.amountCents;
  }
  if (row.kind === "expense") {
    return row.direction === "debit" ? row.amountCents : -row.amountCents;
  }
  // asset/liability/equity — fora do escopo do DRE simplificado, ver comentário no topo do arquivo.
  return 0;
}

function aggregateDreRows(
  rows: readonly RawLedgerRow[],
  periodStartISO: string,
  periodEndISO: string,
): DreReport {
  const totalsByAccountCode = new Map<string, DreLine & { kind: "revenue" | "expense" }>();

  for (const row of rows) {
    if (row.kind !== "revenue" && row.kind !== "expense") {
      continue;
    }
    const existing = totalsByAccountCode.get(row.accountCode);
    const delta = normalizedAmountCents(row);
    if (existing) {
      totalsByAccountCode.set(row.accountCode, { ...existing, totalCents: existing.totalCents + delta });
    } else {
      totalsByAccountCode.set(row.accountCode, {
        accountCode: row.accountCode,
        accountName: row.accountName,
        kind: row.kind,
        totalCents: delta,
      });
    }
  }

  const revenueLines: DreLine[] = [];
  const expenseLines: DreLine[] = [];
  for (const line of totalsByAccountCode.values()) {
    if (line.kind === "revenue") {
      revenueLines.push(line);
    } else {
      expenseLines.push(line);
    }
  }
  revenueLines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  expenseLines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalRevenueCents = revenueLines.reduce((sum, line) => sum + line.totalCents, 0);
  const totalExpenseCents = expenseLines.reduce((sum, line) => sum + line.totalCents, 0);

  return {
    periodStartISO,
    periodEndISO,
    revenueLines,
    expenseLines,
    totalRevenueCents,
    totalExpenseCents,
    netResultCents: totalRevenueCents - totalExpenseCents,
  };
}

/**
 * Soma `ledger_entries.amount_cents` agrupado por `accounts.code`/`accounts.kind`, filtrando por
 * `created_at` dentro de `[periodStartISO, periodEndISO)` (limite superior exclusivo — ver
 * `ComputeDreForPeriodParams.periodEndISO`) e, opcionalmente, por unidade (melhor esforço — ver
 * comentário no topo do arquivo). Roda inteiramente dentro de uma única transação `withTenant`
 * (RLS + `SET LOCAL` via `set_config`, docs/adr/0007) — nunca fora dela.
 */
export async function computeDreForPeriod(params: ComputeDreForPeriodParams): Promise<DreReport> {
  const { tenantId, actorId, periodStartISO, periodEndISO, unitId } = params;

  const periodStart = new Date(periodStartISO);
  const periodEndExclusive = new Date(periodEndISO);
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEndExclusive.getTime())) {
    throw new RangeError(
      `Período inválido para o DRE: periodStartISO="${periodStartISO}" periodEndISO="${periodEndISO}".`,
    );
  }

  const rows = await withTenant({ tenantId, actorId }, async (db): Promise<RawLedgerRow[]> => {
    const allRows = await db
      .select({
        accountCode: accounts.code,
        accountName: accounts.name,
        kind: accounts.kind,
        direction: ledgerEntries.direction,
        amountCents: ledgerEntries.amountCents,
        reservationId: ledgerEntries.reservationId,
      })
      .from(ledgerEntries)
      .innerJoin(accounts, eq(ledgerEntries.accountId, accounts.id))
      .where(
        and(
          eq(ledgerEntries.tenantId, tenantId),
          gte(ledgerEntries.createdAt, periodStart),
          lt(ledgerEntries.createdAt, periodEndExclusive),
        ),
      );

    if (unitId === undefined) {
      return allRows;
    }

    const unitReservationRows = await db
      .select({ id: reservations.id })
      .from(reservations)
      .where(and(eq(reservations.tenantId, tenantId), eq(reservations.unitId, unitId)));
    const unitReservationIds = new Set(unitReservationRows.map((row) => row.id));

    return allRows.filter(
      (row) => row.reservationId !== null && unitReservationIds.has(row.reservationId),
    );
  });

  return aggregateDreRows(rows, periodStartISO, periodEndISO);
}

export interface UnitOption {
  readonly id: string;
  readonly name: string;
}

/** Lista as unidades do tenant para popular o seletor opcional da página — leitura simples, sem
 * agregação nenhuma. */
export async function listUnitsForTenant(params: {
  tenantId: string;
  actorId: string;
}): Promise<UnitOption[]> {
  const { tenantId, actorId } = params;
  return withTenant({ tenantId, actorId }, async (db) => {
    const rows = await db
      .select({ id: units.id, name: units.name })
      .from(units)
      .where(eq(units.tenantId, tenantId));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  });
}
