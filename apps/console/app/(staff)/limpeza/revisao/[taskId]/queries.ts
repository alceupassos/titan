// Leitura real do painel de revisão fotográfica (Fase 6, Passo 4d — docs/fase-atual.md, seção
// 9.8.1 do prompt único). Ao contrário de ./sample-data.ts (usado por ./page.tsx quando não há
// Postgres vivo nesta máquina — Gap conhecido 2), este arquivo é a query de VERDADE contra o
// banco via `withTenant`, mesmo padrão de apps/console/app/(staff)/reservas/nova/actions.ts.
//
// Três peças buscadas:
// 1. A `cleaning_task` (packages/db's cleaningTasks) pelo id, escopada ao tenant.
// 2. As entradas de `evidence_log` relevantes a esta tarefa. `evidence_log` é uma cadeia de hash
//    ÚNICA POR TENANT (I10, packages/domain/src/evidence/chain.ts), não uma tabela por tarefa —
//    então a única forma de achar "as capturas desta tarefa" é buscar TODAS as linhas do tenant e
//    filtrar em memória por `envelope.taskId` (jsonb). LIMITAÇÃO DE PERFORMANCE DOCUMENTADA: isto
//    é O(tamanho da cadeia inteira do tenant) a cada abertura de painel — aceitável para o volume
//    de demonstração desta fase, mas precisa de um índice dedicado (ex.: coluna gerada
//    `envelope->>'taskId'` com índice, ou uma tabela de junção `cleaning_task_evidence`) antes de
//    um volume real de produção. Não corrigido aqui porque mexer no schema de `evidence_log` é
//    escopo de `packages/db`, fora desta faixa (ver instruções desta tarefa).
// 3. Se existir uma reserva associada à unidade cujo check-out (fim da `stay`) é o gatilho desta
//    virada, resolve a `ChannelClaimRule` vigente para aquele canal+data e calcula o prazo de
//    sinistro. DECISÃO DE SHAPE: `cleaning_tasks` (packages/db/src/schema/cleaning-task.ts) NÃO
//    tem FK para `reservations` — só `unitId`. Não existe, em nenhuma fase construída até aqui, um
//    vínculo explícito "esta virada foi gerada por aquele check-out" (bounded context
//    `housekeeping`/`booking` ainda não desenha esse relacionamento). Heurística adotada, explícita
//    e documentada: a reserva associada é a `confirmed` mais recente desta unidade cujo check-out
//    (`stay` upper bound) é <= `startedAt` da tarefa — a estadia mais recente que já terminou antes
//    desta virada começar. Isto é uma aproximação, não uma garantia estrutural; um vínculo real
//    (coluna `reservation_id` em `cleaning_tasks`) é a correção correta quando este bounded context
//    for modelado.
import { and, desc, eq, inArray } from "drizzle-orm";
import { civilDate, stay, type Stay } from "@titan/dates";
import {
  isDiscarded,
  type AssuranceLevel,
  type CaptureEntry,
  type Channel,
  type ChannelClaimRule,
  type DiscardEntry,
  type EvidenceEntry,
  NoChannelClaimRuleForDateError,
  OverlappingChannelClaimRuleError,
  computeClaimDeadlineEpochMs,
  resolveClaimDeadlineForChannel,
} from "@titan/domain";
import {
  channelClaimRules,
  cleaningTasks,
  evidenceLog,
  reservations,
  withTenant,
  type TenantDb,
} from "@titan/db";
import { requireStaffSession } from "@/lib/auth/session";

/** Mesmo parser de `apps/console/app/(staff)/reservas/nova/actions.ts` — Postgres canonicaliza
 * `daterange` para "[lower,upper)" em toda leitura, então é seguro replicar aqui sem importar de
 * outro app. */
function parseDaterangeLiteral(literal: string): Stay {
  const match = /^\[([^,]+),([^)]+)\)$/.exec(literal);
  if (!match) {
    throw new Error(`daterange em formato inesperado: "${literal}".`);
  }
  const [, checkinISO, checkoutISO] = match;
  return stay(checkinISO!, checkoutISO!);
}

export interface EvidencePiece {
  readonly entryHash: string;
  readonly contentHash: string;
  readonly assuranceLevel: AssuranceLevel;
  readonly room: string;
  readonly capturedAtEpochMs: number;
  readonly discarded: boolean;
  readonly discardReason?: string;
}

export interface ClaimDeadlineInfo {
  readonly channel: Channel;
  readonly deadlineEpochMs: number;
  readonly ruleId: string;
}

export type ClaimDeadlineResolution =
  | { readonly kind: "resolved"; readonly info: ClaimDeadlineInfo }
  | { readonly kind: "no-reservation" }
  | { readonly kind: "no-rule"; readonly channel: Channel }
  | { readonly kind: "ambiguous-rule"; readonly channel: Channel };

export interface CleaningTaskReview {
  readonly cleaningTaskId: string;
  readonly unitId: string;
  readonly assignedTo: string;
  readonly status: string;
  readonly startedAtEpochMs: number;
  readonly evidence: readonly EvidencePiece[];
  readonly claimDeadline: ClaimDeadlineResolution;
}

/** Raw row shape de `evidence_log` (packages/db/src/schema/evidence-log.ts) convertido para o
 * `EvidenceEntry` de `@titan/domain` — só o necessário para `isDiscarded` funcionar (não chamamos
 * `verifyChain` aqui: exigiria a MESMA função de hash usada por `packages/evidence` no momento da
 * captura, pacote de outra faixa paralela desta fase, que este painel não deve importar/assumir —
 * ver limitação em CleaningTaskReview acima). */
function toEvidenceEntry(row: typeof evidenceLog.$inferSelect): EvidenceEntry {
  if (row.kind === "discard") {
    return {
      kind: "discard",
      entryHash: row.entryHash,
      prevHash: row.prevHash,
      discardedEntryHash: row.discardedEntryHash ?? "",
      reason: row.reason ?? "",
    } satisfies DiscardEntry;
  }
  return {
    kind: "capture",
    entryHash: row.entryHash,
    prevHash: row.prevHash,
    contentHash: row.contentHash ?? "",
    assuranceLevel: (row.assuranceLevel ?? "A0") as AssuranceLevel,
    envelope: JSON.stringify(row.envelope ?? {}),
  } satisfies CaptureEntry;
}

async function resolveClaimDeadline(
  db: TenantDb,
  params: { tenantId: string; unitId: string; taskStartedAtEpochMs: number },
): Promise<ClaimDeadlineResolution> {
  const candidateRows = await db
    .select({ stay: reservations.stay, channel: reservations.channel })
    .from(reservations)
    .where(and(eq(reservations.unitId, params.unitId), inArray(reservations.status, ["confirmed"])))
    .orderBy(desc(reservations.createdAt));

  let bestChannel: Channel | undefined;
  let bestCheckoutMs = -Infinity;
  let bestCheckoutISO: string | undefined;

  for (const row of candidateRows) {
    const parsedStay = parseDaterangeLiteral(row.stay);
    const checkoutMs = Date.parse(`${parsedStay.checkout}T00:00:00Z`);
    if (checkoutMs <= params.taskStartedAtEpochMs && checkoutMs > bestCheckoutMs) {
      bestCheckoutMs = checkoutMs;
      bestChannel = row.channel as Channel;
      bestCheckoutISO = parsedStay.checkout;
    }
  }

  if (!bestChannel || !bestCheckoutISO) {
    return { kind: "no-reservation" };
  }

  const ruleRows = await db
    .select()
    .from(channelClaimRules)
    .where(and(eq(channelClaimRules.tenantId, params.tenantId), eq(channelClaimRules.channel, bestChannel)));

  const rules: ChannelClaimRule[] = ruleRows.map((rule) => ({
    id: rule.id,
    tenantId: rule.tenantId,
    channel: rule.channel as Channel,
    deadlineHours: rule.deadlineHours,
    validFrom: civilDate(rule.validFrom),
    validTo: civilDate(rule.validTo),
  }));

  try {
    const rule = resolveClaimDeadlineForChannel(rules, {
      channel: bestChannel,
      date: civilDate(bestCheckoutISO),
    });
    const deadlineEpochMs = computeClaimDeadlineEpochMs(bestCheckoutMs, rule);
    return { kind: "resolved", info: { channel: bestChannel, deadlineEpochMs, ruleId: rule.id } };
  } catch (err) {
    if (err instanceof NoChannelClaimRuleForDateError) {
      return { kind: "no-rule", channel: bestChannel };
    }
    if (err instanceof OverlappingChannelClaimRuleError) {
      return { kind: "ambiguous-rule", channel: bestChannel };
    }
    throw err;
  }
}

/**
 * Busca a `cleaning_task` real + evidências associadas + prazo de sinistro (se resolvível).
 * Retorna `null` se a tarefa não existir para o tenant da sessão atual — quem chama decide o
 * fallback (./page.tsx cai para ./sample-data.ts quando isto retorna `null` OU lança, já que sem
 * Postgres vivo nesta máquina toda chamada real falha por erro de conexão — mesmo padrão de
 * apps/console/app/(staff)/aprovacoes).
 */
export async function getCleaningTaskReview(cleaningTaskId: string): Promise<CleaningTaskReview | null> {
  const session = await requireStaffSession();

  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, async (db) => {
    const [taskRow] = await db.select().from(cleaningTasks).where(eq(cleaningTasks.id, cleaningTaskId));
    if (!taskRow) {
      return null;
    }

    const evidenceRows = await db.select().from(evidenceLog).where(eq(evidenceLog.tenantId, session.tenantId));
    const chain: EvidenceEntry[] = evidenceRows
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(toEvidenceEntry);

    const evidence: EvidencePiece[] = [];
    for (const row of evidenceRows) {
      if (row.kind !== "capture") continue;
      const envelope = row.envelope as { taskId?: string; room?: string; capturedAtEpochMs?: number } | null;
      if (!envelope || envelope.taskId !== cleaningTaskId) continue;

      evidence.push({
        entryHash: row.entryHash,
        contentHash: row.contentHash ?? "",
        assuranceLevel: (row.assuranceLevel ?? "A0") as AssuranceLevel,
        room: envelope.room ?? "—",
        capturedAtEpochMs: envelope.capturedAtEpochMs ?? row.createdAt.getTime(),
        discarded: isDiscarded(chain, row.entryHash),
      });
    }

    const claimDeadline = await resolveClaimDeadline(db, {
      tenantId: session.tenantId,
      unitId: taskRow.unitId,
      taskStartedAtEpochMs: taskRow.startedAt.getTime(),
    });

    return {
      cleaningTaskId: taskRow.id,
      unitId: taskRow.unitId,
      assignedTo: taskRow.assignedTo,
      status: taskRow.status,
      startedAtEpochMs: taskRow.startedAt.getTime(),
      evidence,
      claimDeadline,
    };
  });
}
