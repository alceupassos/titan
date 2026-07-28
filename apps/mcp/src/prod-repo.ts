// Repositório tenant-scoped do titan-mcp-prod (Fase 10, Passo 4a — docs/fase-atual.md). MESMO
// padrão de apps/worker/src/channel-sync-repo.ts: este processo, como o worker, NÃO tem sessão
// web (um servidor MCP conversa por stdio, não por cookie de navegador) — `tenantId` é SEMPRE
// parâmetro explícito de cada função, nunca inferido de sessão. Cada função abre sua própria
// transação via `withTenant({ tenantId, actorId: "agent:concierge" }, ...)`, nunca reaproveitando
// contexto entre chamadas.
//
// Todo cálculo de negócio real (preço, piso, aprovação) já existe em `packages/domain`/
// `apps/console/app/(staff)/pricing/actions.ts` — este arquivo só lê/grava, delegando forma de
// dado ao schema existente, nunca reimplementando regra de domínio.
import { desc, eq } from "drizzle-orm";
import {
  approvalRequests,
  pricingSnapshots,
  reservations,
  units,
  withTenant,
} from "@titan/db";
import type { Cents } from "@titan/domain";

/** Ator fixo para toda escrita deste servidor — convenção `agent:<nome> v<versão>` já usada desde
 * a Fase 5 (ver docs/fase-atual.md, Fase 5/8). `withTenant` grava isto em `app.actor_id` (RLS de
 * auditoria) e é o mesmo valor usado em `requestedBy` de `approval_requests`. */
const AGENT_ACTOR_ID = "agent:concierge";
const AGENT_REQUESTED_BY = "agent:concierge v0.1";

const CONFIRMED_STATUS = "confirmed" as const;

export class ReservationNotFoundError extends Error {
  constructor(reservationId: string) {
    super(`Reserva "${reservationId}" não encontrada para este tenant.`);
    this.name = "ReservationNotFoundError";
  }
}

/** Parser mínimo de `daterange` textual do Postgres — deliberadamente duplicado de
 * `apps/worker/src/channel-sync-dates.ts::parsePgDateRange` em vez de importado: `apps/worker`
 * não é dependência de workspace de `apps/mcp` (são dois apps irmãos, nenhum consome o outro), e
 * criar uma dependência cross-app só para uma função de 5 linhas seria pior que a duplicação
 * documentada aqui. Se este parser precisar de mudança, mudar os dois lugares. */
function parsePgDateRange(raw: string): { checkin: string; checkout: string } {
  const match = /^[[(](\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})[)\]]$/.exec(raw);
  if (!match) {
    throw new Error(
      `Formato de daterange do Postgres inesperado: "${raw}" (esperado "[YYYY-MM-DD,YYYY-MM-DD)").`,
    );
  }
  return { checkin: match[1]!, checkout: match[2]! };
}

/** Sobreposição de dois intervalos meio-abertos ("[start,end)") comparados lexicograficamente —
 * válido porque CivilDate é sempre "YYYY-MM-DD" (mesmo padrão já usado em
 * `apps/worker/src/channel-sync-repo.ts::buildRateSnapshot`). */
function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export interface OccupancyReportParams {
  readonly periodStart: string;
  readonly periodEnd: string;
}

export interface OccupancyReportRow {
  readonly unitId: string;
  readonly unitName: string;
  /** Contagem SIMPLES de reservas `confirmed` que se sobrepõem ao período — não é
   * noites-ocupadas nem taxa de ocupação (%). Agregação básica desta fase, documentada como tal
   * (ver briefing do Passo 4a): um bounded context `analytics` futuro pode refinar isto. */
  readonly confirmedReservationsOverlapping: number;
}

/** Ocupação agregada por unidade/período — conta reservas `confirmed` cuja estadia (`stay`)
 * se sobrepõe a `[periodStart, periodEnd)`. Inclui TODAS as unidades do tenant, mesmo com
 * contagem zero, para o relatório não omitir silenciosamente unidade sem reserva no período. */
export async function getOccupancyReport(
  tenantId: string,
  params: OccupancyReportParams,
): Promise<OccupancyReportRow[]> {
  return withTenant({ tenantId, actorId: AGENT_ACTOR_ID }, async (db) => {
    const [unitRows, reservationRows] = await Promise.all([
      db.select({ id: units.id, name: units.name }).from(units),
      db
        .select({ unitId: reservations.unitId, stay: reservations.stay })
        .from(reservations)
        .where(eq(reservations.status, CONFIRMED_STATUS)),
    ]);

    const countByUnit = new Map<string, number>();
    for (const row of reservationRows) {
      const { checkin, checkout } = parsePgDateRange(row.stay);
      if (overlaps(checkin, checkout, params.periodStart, params.periodEnd)) {
        countByUnit.set(row.unitId, (countByUnit.get(row.unitId) ?? 0) + 1);
      }
    }

    return unitRows.map((unit) => ({
      unitId: unit.id,
      unitName: unit.name,
      confirmedReservationsOverlapping: countByUnit.get(unit.id) ?? 0,
    }));
  });
}

export interface ReservationSummary {
  readonly reservationId: string;
  readonly unitId: string;
  readonly checkin: string;
  readonly checkout: string;
  readonly status: string;
  readonly channel: string;
  /**
   * `externalRef` (referência da OTA/canal) mascarada — só os últimos 4 caracteres visíveis,
   * resto substituído por "*". `reservations` NÃO tem coluna de nome/documento/telefone de
   * hóspede (dívida técnica já documentada desde a Fase 2, docs/fase-atual.md: "dados do hóspede
   * não têm onde persistir" — bounded context `crm` ainda não modelado), então não há PII de
   * hóspede real para mascarar hoje; `externalRef` é o único identificador externo presente no
   * schema e é tratado com a mesma cautela por precaução, nunca devolvido cru.
   */
  readonly externalRefMasked: string | null;
}

/** Resumo de UMA reserva, com o único identificador externo presente no schema (`externalRef`)
 * mascarado. Lança `ReservationNotFoundError` se a reserva não existir OU pertencer a outro
 * tenant — RLS já garante isolamento (zero linhas, fail-closed), este erro só torna a ausência
 * explícita para quem chama a ferramenta, em vez de devolver um resultado vazio ambíguo. */
export async function getReservationSummary(
  tenantId: string,
  reservationId: string,
): Promise<ReservationSummary> {
  return withTenant({ tenantId, actorId: AGENT_ACTOR_ID }, async (db) => {
    const [row] = await db
      .select({
        id: reservations.id,
        unitId: reservations.unitId,
        stay: reservations.stay,
        status: reservations.status,
        channel: reservations.channel,
        externalRef: reservations.externalRef,
      })
      .from(reservations)
      .where(eq(reservations.id, reservationId));

    if (!row) {
      throw new ReservationNotFoundError(reservationId);
    }

    const { checkin, checkout } = parsePgDateRange(row.stay);
    const externalRefMasked =
      row.externalRef && row.externalRef.length > 4
        ? `${"*".repeat(row.externalRef.length - 4)}${row.externalRef.slice(-4)}`
        : row.externalRef
          ? "*".repeat(row.externalRef.length)
          : null;

    return {
      reservationId: row.id,
      unitId: row.unitId,
      checkin,
      checkout,
      status: row.status,
      channel: row.channel,
      externalRefMasked,
    };
  });
}

export interface PricingSuggestionRow {
  readonly date: string;
  readonly suggestedPriceCents: Cents;
  readonly finalPriceCents: Cents;
  readonly modelVersion: string;
  readonly approvedBy: string | null;
}

const RECENT_PRICING_SNAPSHOTS_LIMIT = 10;

/** As sugestões/decisões de preço mais recentes (`pricing_snapshots`, I8) para uma unidade —
 * limitado às últimas 10 datas por padrão, para não devolver o histórico inteiro de uma unidade
 * antiga a um agente. */
export async function getPricingSuggestions(
  tenantId: string,
  unitId: string,
): Promise<PricingSuggestionRow[]> {
  return withTenant({ tenantId, actorId: AGENT_ACTOR_ID }, async (db) => {
    const rows = await db
      .select({
        date: pricingSnapshots.date,
        suggestedPriceCents: pricingSnapshots.suggestedPriceCents,
        finalPriceCents: pricingSnapshots.finalPriceCents,
        modelVersion: pricingSnapshots.modelVersion,
        approvedBy: pricingSnapshots.approvedBy,
      })
      .from(pricingSnapshots)
      .where(eq(pricingSnapshots.unitId, unitId))
      .orderBy(desc(pricingSnapshots.date))
      .limit(RECENT_PRICING_SNAPSHOTS_LIMIT);

    return rows;
  });
}

export interface ProposeRateChangeInput {
  readonly unitId: string;
  readonly date: string;
  readonly suggestedPriceCents: Cents;
}

const AGENT_PROPOSAL_MODEL_VERSION = "titan-mcp-prod-proposal-v1";

/**
 * Propõe uma mudança de preço — INSERE em `pricing_snapshots` com `finalPriceCents` IGUAL ao
 * sugerido (é proposta, nunca publicação: `approvedBy` sempre `null`). Mesmo shape de INSERT
 * usado por `apps/console/app/(staff)/pricing/actions.ts::runPricingSuggestionAction`, reusando a
 * MESMA tabela/constraint `UNIQUE(unit_id, date)` — nunca um caminho paralelo de proposta de
 * preço. Um segundo `propose_rate_change` para a mesma unidade/data faz `onConflictDoUpdate`
 * (mesma decisão de idempotência já tomada pela Server Action do cockpit), nunca duplica linha.
 */
export async function proposeRateChange(
  tenantId: string,
  input: ProposeRateChangeInput,
): Promise<{ snapshotId: string }> {
  return withTenant({ tenantId, actorId: AGENT_ACTOR_ID }, async (db) => {
    const inputs = {
      proposedBy: AGENT_ACTOR_ID,
      note: "Proposta de agente via titan-mcp-prod — nunca publicada automaticamente.",
    };
    const [row] = await db
      .insert(pricingSnapshots)
      .values({
        tenantId,
        unitId: input.unitId,
        date: input.date,
        inputs,
        modelVersion: AGENT_PROPOSAL_MODEL_VERSION,
        suggestedPriceCents: input.suggestedPriceCents,
        finalPriceCents: input.suggestedPriceCents,
        approvedBy: null,
      })
      .onConflictDoUpdate({
        target: [pricingSnapshots.unitId, pricingSnapshots.date],
        set: {
          inputs,
          modelVersion: AGENT_PROPOSAL_MODEL_VERSION,
          suggestedPriceCents: input.suggestedPriceCents,
          finalPriceCents: input.suggestedPriceCents,
          approvedBy: null,
          createdAt: new Date(),
        },
      })
      .returning({ id: pricingSnapshots.id });

    if (!row) {
      throw new Error("INSERT de pricing_snapshot (proposta de agente) não retornou id.");
    }
    return { snapshotId: row.id };
  });
}

export interface CreateAgentApprovalRequestInput {
  readonly rationale: string;
  readonly impact: Readonly<Record<string, unknown>>;
  readonly risk: "low" | "medium" | "high";
}

const APPROVAL_SLA_MS = 24 * 60 * 60 * 1000;

/**
 * Abre uma `approval_request` tipo `agent_action` — a PRIMEIRA vez que este tipo é usado de
 * verdade no monorepo (até aqui só existia como valor válido do union, sem nenhum caminho real de
 * criação; ver `packages/domain/src/approval/approval-request.ts`). `requiredApprovals: 1`,
 * `stepUpRequired: false` (nenhuma ação financeira/fiscal é criada por este caminho — só um
 * pedido de decisão humana), `status: "pending"`, `slaAt` = agora + 24h (mesmo padrão de SLA já
 * usado desde a Fase 8 para `price_out_of_band`). NUNCA aprova/executa nada sozinha — só entra na
 * mesma fila `/aprovacoes` já existente desde a Fase 2.
 */
export async function createAgentApprovalRequest(
  tenantId: string,
  input: CreateAgentApprovalRequestInput,
): Promise<{ approvalRequestId: string }> {
  return withTenant({ tenantId, actorId: AGENT_ACTOR_ID }, async (db) => {
    const [row] = await db
      .insert(approvalRequests)
      .values({
        tenantId,
        type: "agent_action",
        requestedBy: AGENT_REQUESTED_BY,
        rationale: input.rationale,
        impact: input.impact,
        risk: input.risk,
        requiredApprovals: 1,
        stepUpRequired: false,
        status: "pending",
        slaAt: new Date(Date.now() + APPROVAL_SLA_MS),
      })
      .returning({ id: approvalRequests.id });

    if (!row) {
      throw new Error("INSERT de approval_request (agent_action) não retornou id.");
    }
    return { approvalRequestId: row.id };
  });
}
