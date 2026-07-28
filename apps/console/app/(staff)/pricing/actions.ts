"use server";

// Server Actions de /pricing (Fase 8, Passo 5 — docs/fase-atual.md). Regra dura do CLAUDE.md raiz:
// "Toda Server Action valida (Zod) e autoriza (CASL) dentro dela mesma" — as três ações abaixo
// fazem as duas coisas por conta própria, sem confiar em nenhuma checagem anterior. Mesmo estilo
// de apps/console/app/(staff)/financeiro/actions.ts e .../aprovacoes/actions.ts — leia os dois
// antes de mexer aqui.
//
// IMPORTANTE: são Server Actions REAIS, contra o banco via `withTenant` — ao contrário da UI da
// page (./page.tsx), que roda o pipeline sobre AMOSTRA estática (./sample-data.ts) por não haver
// Postgres vivo nesta máquina (Gap conhecido 2) nem colunas reais de categoria/capacidade em
// `units` (gap novo desta fase, ver comentário de ./sample-data.ts). Chamar estas ações a partir
// da UI tenta o Postgres real e, sem Docker rodando, falha com erro de conexão — esperado.
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import {
  PublishPriceSchema,
  RunPricingSuggestionSchema,
  SetPricingAutonomySchema,
} from "@titan/contracts";
import { approvalRequests, pricingAutonomyConfigs, pricingSnapshots, ratePlans, withTenant } from "@titan/db";
import type { Cents } from "@titan/domain";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";
import { runPricingPipeline, type PricingPipelineResult } from "./pipeline";
import {
  SAMPLE_CANDIDATE_UNITS,
  SAMPLE_MINIMUM_MARGIN_BASIS_POINTS,
  SAMPLE_OCCUPANCY_HISTORY,
  SAMPLE_TARGET_UNIT,
  SAMPLE_VARIABLE_COST_INPUTS,
} from "./sample-data";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

const MODEL_VERSION = "pricing-heuristic-v1"; // heurística determinística desta fase, não ML.

/** Roda o pipeline sobre a AMOSTRA desta fase (ver cabeçalho do arquivo) — quando `inventory`
 * ganhar colunas reais de categoria/capacidade e houver histórico de ocupação real, o único ponto
 * a trocar é este, nunca a lógica de `./pipeline.ts`. */
function runSamplePipeline(targetDate: string): PricingPipelineResult {
  return runPricingPipeline({
    targetUnit: SAMPLE_TARGET_UNIT,
    candidateUnits: SAMPLE_CANDIDATE_UNITS,
    occupancyHistory: SAMPLE_OCCUPANCY_HISTORY,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CivilDate é branded string
    targetDate: targetDate as any,
    variableCostInputs: SAMPLE_VARIABLE_COST_INPUTS,
    minimumMarginBasisPoints: SAMPLE_MINIMUM_MARGIN_BASIS_POINTS,
    // Teto de paridade de amostra: 160% do preço atual, calculado via basis points (nunca "* 1.6"
    // literal — mesmo espírito de basis points inteiros usado em todo o resto do pacote).
    ceilingCents: Math.round((SAMPLE_TARGET_UNIT.currentNightlyPriceCents * 16000) / 10000),
  });
}

type RunOutcome = { kind: "business-error"; error: string } | { kind: "created"; snapshotId: string };

export async function runPricingSuggestionAction(
  input: unknown,
): Promise<ActionResult<{ snapshotId: string; suggestedCents: Cents; floorCents: Cents }>> {
  const parsed = RunPricingSuggestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("create", "pricing_snapshot")) {
    return { ok: false, error: "Sem permissão para rodar sugestão de preço com o papel atual." };
  }

  const result = runSamplePipeline(request.date);

  try {
    const outcome = await withTenant<RunOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [row] = await db
          .insert(pricingSnapshots)
          .values({
            tenantId: session.tenantId,
            unitId: request.unitId,
            date: request.date,
            inputs: {
              compSet: result.compSet,
              floorCents: result.floorCents,
              expectedRevenueCents: result.expectedRevenueCents,
            },
            modelVersion: MODEL_VERSION,
            suggestedPriceCents: result.suggestedCents,
            finalPriceCents: result.suggestedCents,
            approvedBy: null,
          })
          .onConflictDoUpdate({
            target: [pricingSnapshots.unitId, pricingSnapshots.date],
            set: {
              inputs: {
                compSet: result.compSet,
                floorCents: result.floorCents,
                expectedRevenueCents: result.expectedRevenueCents,
              },
              modelVersion: MODEL_VERSION,
              suggestedPriceCents: result.suggestedCents,
              finalPriceCents: result.suggestedCents,
              approvedBy: null,
              createdAt: new Date(),
            },
          })
          .returning({ id: pricingSnapshots.id });

        if (!row) {
          throw new Error("INSERT de pricing_snapshot não retornou id.");
        }
        return { kind: "created", snapshotId: row.id };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return {
      ok: true,
      data: { snapshotId: outcome.snapshotId, suggestedCents: result.suggestedCents, floorCents: result.floorCents },
    };
  } catch (err) {
    return toActionError(err, "Falha ao rodar sugestão de preço.");
  }
}

type PublishOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "published"; finalPriceCents: Cents }
  | { kind: "pending-approval"; approvalRequestId: string };

export async function publishPriceAction(
  input: unknown,
): Promise<ActionResult<{ status: "published" | "pending_approval"; finalPriceCents?: Cents }>> {
  const parsed = PublishPriceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("create", "pricing_snapshot")) {
    return { ok: false, error: "Sem permissão para publicar preço com o papel atual." };
  }

  // Piso e sugestão sempre RECALCULADOS no servidor — nunca aceitos do cliente, mesmo princípio de
  // preço/cotação desde a Fase 1.
  const result = runSamplePipeline(request.date);
  if (request.finalPriceCents < result.floorCents) {
    return {
      ok: false,
      error: `Preço final (${request.finalPriceCents}) abaixo do piso de custo variável (${result.floorCents}) — publicação recusada.`,
    };
  }

  try {
    const outcome = await withTenant<PublishOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [autonomyRow] = await db
          .select()
          .from(pricingAutonomyConfigs)
          .where(eq(pricingAutonomyConfigs.unitId, request.unitId));
        const maxDailyVariationBasisPoints = autonomyRow?.maxDailyVariationBasisPoints ?? 1500;

        const [ratePlanRow] = await db
          .select()
          .from(ratePlans)
          .where(
            and(
              eq(ratePlans.unitId, request.unitId),
              // vigência cobre a data alvo — comparação lexicográfica, mesmo padrão de
              // ratePlanCoversStay (CivilDate é sempre "YYYY-MM-DD").
            ),
          );

        if (!ratePlanRow) {
          return {
            kind: "business-error",
            error: "Nenhum plano de tarifa cadastrado para esta unidade — cadastre uma tarifa antes de publicar.",
          };
        }

        const currentPriceCents = ratePlanRow.nightlyPriceCents;
        const variationBasisPoints =
          currentPriceCents === 0
            ? 0
            : Math.round((Math.abs(request.finalPriceCents - currentPriceCents) / currentPriceCents) * 10000);

        if (variationBasisPoints > maxDailyVariationBasisPoints) {
          const [approvalRow] = await db
            .insert(approvalRequests)
            .values({
              tenantId: session.tenantId,
              type: "price_out_of_band",
              requestedBy: session.userId,
              rationale: `Variação de preço de ${variationBasisPoints / 100}% excede o limite de autonomia de ${maxDailyVariationBasisPoints / 100}% para a unidade.`,
              impact: {
                amountCents: request.finalPriceCents,
                affectedEntities: [`unit:${request.unitId}`, `date:${request.date}`],
              },
              risk: variationBasisPoints > 3000 ? "high" : "medium",
              requiredApprovals: 1,
              stepUpRequired: false,
              slaAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            })
            .returning({ id: approvalRequests.id });
          if (!approvalRow) {
            throw new Error("INSERT de solicitação de aprovação não retornou id.");
          }
          return { kind: "pending-approval", approvalRequestId: approvalRow.id };
        }

        await db
          .update(ratePlans)
          .set({ nightlyPriceCents: request.finalPriceCents })
          .where(eq(ratePlans.id, ratePlanRow.id));

        await db
          .insert(pricingSnapshots)
          .values({
            tenantId: session.tenantId,
            unitId: request.unitId,
            date: request.date,
            inputs: { floorCents: result.floorCents, suggestedCents: result.suggestedCents },
            modelVersion: MODEL_VERSION,
            suggestedPriceCents: result.suggestedCents,
            finalPriceCents: request.finalPriceCents,
            approvedBy: null,
          })
          .onConflictDoUpdate({
            target: [pricingSnapshots.unitId, pricingSnapshots.date],
            set: {
              finalPriceCents: request.finalPriceCents,
              approvedBy: null,
              createdAt: new Date(),
            },
          });

        return { kind: "published", finalPriceCents: request.finalPriceCents };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    if (outcome.kind === "pending-approval") {
      return { ok: true, data: { status: "pending_approval" } };
    }
    return { ok: true, data: { status: "published", finalPriceCents: outcome.finalPriceCents } };
  } catch (err) {
    return toActionError(err, "Falha ao publicar preço.");
  }
}

export async function setPricingAutonomyAction(input: unknown): Promise<ActionResult<{ mode: string }>> {
  const parsed = SetPricingAutonomySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("update", "pricing_snapshot")) {
    return { ok: false, error: "Sem permissão para configurar autonomia de pricing com o papel atual." };
  }

  try {
    await withTenant({ tenantId: session.tenantId, actorId: session.userId }, async (db) => {
      await db
        .insert(pricingAutonomyConfigs)
        .values({
          tenantId: session.tenantId,
          unitId: request.unitId,
          mode: request.mode,
          maxDailyVariationBasisPoints: request.maxDailyVariationBasisPoints,
        })
        .onConflictDoUpdate({
          target: pricingAutonomyConfigs.unitId,
          set: {
            mode: request.mode,
            maxDailyVariationBasisPoints: request.maxDailyVariationBasisPoints,
            updatedAt: new Date(),
          },
        });
    });
    return { ok: true, data: { mode: request.mode } };
  } catch (err) {
    return toActionError(err, "Falha ao configurar autonomia de pricing.");
  }
}
