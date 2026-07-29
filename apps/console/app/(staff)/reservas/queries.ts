// Leitura real de reservas (Grupo E, planoexplica.md) — substitui o placeholder da Fase 1
// ("a lista real chega em F1 junto com o motor de disponibilidade", nunca cumprido até aqui).
// Mesmo padrão de apps/console/app/(staff)/financeiro/dre/queries.ts: tudo dentro de uma única
// transação `withTenant` (RLS + `SET LOCAL`, docs/adr/0007), nunca fora dela.
//
// `stay` é `daterange` (packages/db/src/schema/reservation.ts) — não há operador Drizzle nativo
// para filtrar por `lower(stay)`, então o filtro de período usa `sql` cru (mesma técnica já usada
// em apps/console/app/(staff)/reservas/nova/actions.ts para parsear o literal de range vindo do
// banco, só que aqui é o INVERSO: comparar contra a data, não parsear a string de volta).
import { and, count, eq, sql } from "drizzle-orm";
import { reservations, units, withTenant } from "@titan/db";
import { civilDate, stay, type Stay } from "@titan/dates";
import type { Channel, ReservationStatus } from "@titan/domain";
import type { Cents } from "@titan/domain";

export interface ReservationListItem {
  readonly id: string;
  readonly unitId: string;
  readonly unitName: string;
  readonly stay: Stay;
  readonly status: ReservationStatus;
  readonly channel: Channel;
  readonly priceCents: Cents;
  readonly currency: string;
  readonly guestCount: number | null;
  readonly createdAt: Date;
}

export interface ListReservationsParams {
  readonly tenantId: string;
  readonly actorId: string;
  /** Filtra por CHECK-IN (`lower(stay)`), não por `created_at` — é o que o usuário espera de um
   * filtro de data numa lista de reservas. Ambos inclusivos do ponto de vista do formulário; a
   * página converte o "fim" para exclusivo antes de chamar esta função (mesmo padrão de
   * `financeiro/dre`). */
  readonly checkinFromISO?: string;
  readonly checkinToExclusiveISO?: string;
  readonly unitId?: string;
  readonly status?: ReservationStatus;
  readonly limit: number;
  readonly offset: number;
}

export interface ListReservationsResult {
  readonly items: ReservationListItem[];
  readonly matchCount: number;
}

/** Mesmo parser de `apps/console/app/(staff)/reservas/nova/actions.ts::parseDaterangeLiteral` —
 * duplicado aqui de propósito (cada rota é dona da sua própria leitura, mesmo padrão já aceito
 * em `estoque/sample-data.ts` vs. `limpeza/sample-data.ts`), não importado de lá porque aquele
 * arquivo é `"use server"` de Server Actions, não um módulo de leitura compartilhável. */
function parseDaterangeLiteral(literal: string): Stay {
  const match = /^\[([^,]+),([^)]+)\)$/.exec(literal);
  if (!match) {
    throw new Error(`daterange em formato inesperado: "${literal}".`);
  }
  const [, checkinISO, checkoutISO] = match;
  return stay(checkinISO!, checkoutISO!);
}

function buildWhereClause(params: ListReservationsParams) {
  const conditions = [eq(reservations.tenantId, params.tenantId)];
  if (params.unitId) {
    conditions.push(eq(reservations.unitId, params.unitId));
  }
  if (params.status) {
    conditions.push(eq(reservations.status, params.status));
  }
  if (params.checkinFromISO) {
    conditions.push(sql`lower(${reservations.stay}) >= ${params.checkinFromISO}::date`);
  }
  if (params.checkinToExclusiveISO) {
    conditions.push(sql`lower(${reservations.stay}) < ${params.checkinToExclusiveISO}::date`);
  }
  return and(...conditions);
}

export async function listReservations(params: ListReservationsParams): Promise<ListReservationsResult> {
  return withTenant({ tenantId: params.tenantId, actorId: params.actorId }, async (db) => {
    const whereClause = buildWhereClause(params);

    const [rows, totalRows] = await Promise.all([
      db
        .select({
          id: reservations.id,
          unitId: reservations.unitId,
          unitName: units.name,
          stay: reservations.stay,
          status: reservations.status,
          channel: reservations.channel,
          priceCents: reservations.priceCents,
          currency: reservations.currency,
          guestCount: reservations.guestCount,
          createdAt: reservations.createdAt,
        })
        .from(reservations)
        .innerJoin(units, eq(units.id, reservations.unitId))
        .where(whereClause)
        .orderBy(sql`lower(${reservations.stay}) desc`)
        .limit(params.limit)
        .offset(params.offset),
      db.select({ value: count() }).from(reservations).where(whereClause),
    ]);

    const items: ReservationListItem[] = rows.map((row) => ({
      id: row.id,
      unitId: row.unitId,
      unitName: row.unitName,
      stay: parseDaterangeLiteral(row.stay),
      status: row.status as ReservationStatus,
      channel: row.channel as Channel,
      priceCents: row.priceCents,
      currency: row.currency,
      guestCount: row.guestCount,
      createdAt: row.createdAt,
    }));

    return { items, matchCount: totalRows[0]?.value ?? 0 };
  });
}

export interface ReservationKpis {
  readonly activeCount: number;
  readonly arrivingNext7DaysCount: number;
  readonly cancelledThisMonthCount: number;
}

/** KPIs da visão geral — deliberadamente SEM filtro de data do formulário (o usuário espera ver
 * "hoje" independente do que está filtrando na tabela abaixo). "Overbooking em risco" não entra
 * aqui: calcular isso de verdade exige reavaliar I1 por unidade/período, o que esta faixa não
 * constrói — nunca fingir um número, o KPI correspondente na página fica em `state="empty"`. */
export async function getReservationKpis(params: { tenantId: string; actorId: string }): Promise<ReservationKpis> {
  return withTenant({ tenantId: params.tenantId, actorId: params.actorId }, async (db) => {
    const now = new Date();
    const in7Days = new Date(now);
    in7Days.setUTCDate(in7Days.getUTCDate() + 7);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const nowISO = civilDate(now.toISOString().slice(0, 10));
    const in7ISO = civilDate(in7Days.toISOString().slice(0, 10));

    const [activeRows, arrivingRows, cancelledRows] = await Promise.all([
      db
        .select({ value: count() })
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, params.tenantId),
            sql`${reservations.status} in ('pending', 'confirmed')`,
          ),
        ),
      db
        .select({ value: count() })
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, params.tenantId),
            eq(reservations.status, "confirmed"),
            sql`lower(${reservations.stay}) >= ${nowISO}::date`,
            sql`lower(${reservations.stay}) < ${in7ISO}::date`,
          ),
        ),
      db
        .select({ value: count() })
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, params.tenantId),
            eq(reservations.status, "cancelled"),
            sql`${reservations.createdAt} >= ${monthStart.toISOString()}::timestamptz`,
          ),
        ),
    ]);

    return {
      activeCount: activeRows[0]?.value ?? 0,
      arrivingNext7DaysCount: arrivingRows[0]?.value ?? 0,
      cancelledThisMonthCount: cancelledRows[0]?.value ?? 0,
    };
  });
}

export interface UnitOption {
  readonly id: string;
  readonly name: string;
}

export async function listUnitsForTenant(params: { tenantId: string; actorId: string }): Promise<UnitOption[]> {
  return withTenant({ tenantId: params.tenantId, actorId: params.actorId }, async (db) => {
    const rows = await db.select({ id: units.id, name: units.name }).from(units).where(eq(units.tenantId, params.tenantId));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  });
}
