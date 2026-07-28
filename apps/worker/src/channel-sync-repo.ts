// Operações tenant-scoped da sincronização de canal — TODAS via `withTenant()`, mesmo padrão de
// `payment-repo.ts` (Fase 2): extraídas como interface própria (`ChannelSyncRepo`) para o job
// (`jobs/process-channel-sync.ts`) poder ser testado com um fake plano, sem simular o query
// builder do drizzle.
//
// DÍVIDA TÉCNICA documentada (não escondida — mesmo espírito das notas de dívida técnica de
// `jobs/process-webhook.ts`): `buildAvailabilitySnapshot`/`buildRateSnapshot` são um cálculo
// SIMPLIFICADO do estado atual, aceitável para o Passo 4c/5 da Fase 3:
//   - Disponibilidade: uma unidade está bloqueada num dia se (a) QUALQUER reserva `pending`/
//     `confirmed` cobre aquele dia, OU (b) a própria unidade não está em `ready`/`occupied`
//     (I9 — packages/domain/src/unit/state-machine.ts: `dirty`/`cleaning`/`clean`/`inspected`/
//     `rework`/`blocked` significam "fora de operação", bloqueio total do horizonte inteiro
//     propagado para os 4 canais, não recalculado dia a dia). Não modela overbooking entre canais
//     (isso é I1, garantido no INSERT pela constraint EXCLUDE, não recalculado aqui). **Gap real
//     ainda pendente**: nenhuma Server Action do cockpit hoje TRANSICIONA `units.status` para um
//     estado de bloqueio nem enfileira um `channel-sync` job quando isso acontece — a lógica de
//     propagação abaixo está correta e pronta, mas só dispara quando algo chamar
//     `processChannelSyncJob` para aquela unidade; não há ainda esse "algo" no cockpit (bounded
//     context `housekeeping`/`inventory`, fases futuras).
//   - Tarifa: para cada dia, usa o PRIMEIRO `rate_plan` cuja janela de vigência cobre o dia — sem
//     resolução de prioridade entre planos sobrepostos (bounded context `rates` ainda não tem
//     conceito de prioridade/precedência). Dias sem nenhum plano vigente são omitidos do
//     snapshot (não é enviado um preço zero/inventado ao canal).
import { and, eq, inArray } from "drizzle-orm";
import {
  channelSyncLog,
  divergences,
  ratePlans,
  reservations,
  units,
  withTenant,
  type TenantContext,
} from "@titan/db";
import type { CivilDate } from "@titan/dates";
import { money, type CurrencyCode } from "@titan/money";
import type { AvailabilitySnapshot, Channel, Divergence, RateSnapshot } from "@titan/domain";
import { civilDateRange, parsePgDateRange } from "./channel-sync-dates";

export interface ChannelSyncLogEntryInput {
  readonly channel: Channel;
  readonly unitId: string;
  readonly direction: "push" | "pull";
  readonly status: "ok" | "error";
  readonly detail: Readonly<Record<string, unknown>>;
}

export interface ChannelSyncRepo {
  /** Estado de disponibilidade "agora" para `numDays` a partir de `rangeStart`, calculado a
   * partir de `reservations` — não é uma tabela de disponibilidade própria (ainda não existe
   * nesta fase; a fonte de verdade continua sendo a ausência/presença de reserva). */
  buildAvailabilitySnapshot(
    ctx: TenantContext,
    unitId: string,
    rangeStart: CivilDate,
    numDays: number,
  ): Promise<AvailabilitySnapshot[]>;
  buildRateSnapshot(
    ctx: TenantContext,
    unitId: string,
    rangeStart: CivilDate,
    numDays: number,
  ): Promise<RateSnapshot[]>;
  insertChannelSyncLog(ctx: TenantContext, entry: ChannelSyncLogEntryInput): Promise<void>;
  insertDivergences(ctx: TenantContext, divs: readonly Divergence[]): Promise<void>;
}

const OVERLAP_STATUSES = ["pending", "confirmed"] as const;

export function createDrizzleChannelSyncRepo(): ChannelSyncRepo {
  return {
    async buildAvailabilitySnapshot(ctx, unitId, rangeStart, numDays) {
      return withTenant(ctx, async (db) => {
        const [unitRow] = await db.select({ status: units.status }).from(units).where(eq(units.id, unitId));
        // Fora de `ready`/`occupied` (I9) = unidade fora de operação, bloqueio total do horizonte
        // — propaga para os 4 canais independentemente de haver reserva cobrindo o dia ou não.
        const unitFullyBlocked = unitRow ? unitRow.status !== "ready" && unitRow.status !== "occupied" : false;

        const rows = await db
          .select({ stay: reservations.stay })
          .from(reservations)
          .where(and(eq(reservations.unitId, unitId), inArray(reservations.status, [...OVERLAP_STATUSES])));

        const stays = rows.map((row) => parsePgDateRange(row.stay));
        const days = civilDateRange(rangeStart, numDays);

        return days.map((date) => ({
          unitId,
          date,
          blocked: unitFullyBlocked || stays.some((s) => date >= s.checkin && date < s.checkout),
        }));
      });
    },

    async buildRateSnapshot(ctx, unitId, rangeStart, numDays) {
      return withTenant(ctx, async (db) => {
        const plans = await db.select().from(ratePlans).where(eq(ratePlans.unitId, unitId));
        const days = civilDateRange(rangeStart, numDays);

        const snapshot: RateSnapshot[] = [];
        for (const date of days) {
          const plan = plans.find((p) => date >= p.validFrom && date <= p.validTo);
          if (!plan) {
            continue; // sem plano vigente neste dia — omitido, nunca um preço inventado.
          }
          snapshot.push({ unitId, date, priceAmount: money(plan.nightlyPriceCents, plan.currency as CurrencyCode) });
        }
        return snapshot;
      });
    },

    async insertChannelSyncLog(ctx, entry) {
      await withTenant(ctx, async (db) => {
        await db.insert(channelSyncLog).values({
          tenantId: ctx.tenantId,
          channel: entry.channel,
          unitId: entry.unitId,
          direction: entry.direction,
          status: entry.status,
          detail: entry.detail,
        });
      });
    },

    async insertDivergences(ctx, divs) {
      if (divs.length === 0) {
        return;
      }
      await withTenant(ctx, async (db) => {
        await db.insert(divergences).values(
          divs.map((d) => ({
            tenantId: ctx.tenantId,
            channel: d.channel,
            unitId: d.unitId,
            kind: d.kind,
            date: d.date ?? null,
            detail: d.detail,
            status: "open" as const,
          })),
        );
      });
    },
  };
}
