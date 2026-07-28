"use server";

// Server Action de decisão do painel de revisão fotográfica (Fase 6, Passo 4d —
// docs/fase-atual.md, seção 9.8.1 do prompt único). Regra dura do CLAUDE.md raiz: "Toda Server
// Action valida (Zod) e autoriza (CASL) dentro dela mesma" — mesmo estilo de
// apps/console/app/(staff)/aprovacoes/actions.ts e apps/console/app/(staff)/reservas/nova/actions.ts.
//
// Duas ramificações:
// - `decision === "reject"`: seção 9.8.1 — "reprovar com motivo → rework sem novo pagamento".
//   Transiciona só `cleaning_tasks.status` para `rework`; NENHUM lançamento de ledger é postado
//   neste ramo (garantido pela ausência de qualquer chamada a postDoubleEntry/ledgerEntries aqui,
//   não por um campo explícito).
// - `decision === "approve" | "approve_with_note"`: ANTES de liberar a unidade como `ready`, esta
//   action busca a MENOR `AssuranceLevel` entre as capturas de evidência ativas (não descartadas)
//   desta tarefa e chama `enforceAssuranceLevel(nivel, "release_ready")` de `@titan/domain`. Se a
//   evidência for insuficiente, a função lança `InsufficientAssuranceLevelError` e a action retorna
//   erro claro SEM tocar em `cleaning_tasks` nem `units` — mesmo que o revisor tenha clicado
//   "aprovar" na UI. Esta é a garantia real da seção 9.9 ("consequência financeira decidida por
//   modelo/pessoa sem confirmação humana... nunca sem lastro de evidência"): o servidor decide,
//   nunca a UI.
import { and, eq } from "drizzle-orm";
import { ReviewDecisionSchema } from "@titan/contracts";
import {
  InsufficientAssuranceLevelError,
  enforceAssuranceLevel,
  isDiscarded,
  transitionUnit,
  type AssuranceLevel,
  type CaptureEntry,
  type DiscardEntry,
  type EvidenceEntry,
  type UnitStatus,
} from "@titan/domain";
import { cleaningTasks, evidenceLog, units, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Duplicado deliberadamente de packages/domain/src/evidence/assurance-level.ts: aquele arquivo
// mantém `ASSURANCE_ORDER` como `const` privada (não exportada) — não é um descuido, é um detalhe
// de implementação do pacote de domínio, e esta faixa não deve editar `packages/domain` (fora do
// escopo desta tarefa, ver instruções). `enforceAssuranceLevel` continua sendo o único ÁRBITRO
// real da regra I10/seção 9.9; esta tabela local só serve para achar o MENOR nível entre várias
// capturas antes de perguntar ao árbitro — nunca substitui a checagem dele.
const ASSURANCE_ORDER: Record<AssuranceLevel, number> = { A0: 0, A1: 1, A2: 2, A3: 3 };

function lowestAssuranceLevel(levels: readonly AssuranceLevel[]): AssuranceLevel {
  if (levels.length === 0) {
    // Nenhuma captura ATIVA (não descartada) para esta tarefa — trata como o nível mais fraco
    // possível (A0). `enforceAssuranceLevel("A0", "release_ready")` recusa por construção (mínimo
    // exigido é A1): nunca libera a unidade silenciosamente por falta de evidência.
    return "A0";
  }
  return levels.reduce((lowest, level) => (ASSURANCE_ORDER[level] < ASSURANCE_ORDER[lowest] ? level : lowest));
}

function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

/** Mesmo conversor de ./queries.ts (duplicado deliberadamente — arquivo pequeno, evita import
 * cross-cutting entre a leitura e a escrita para uma conversão trivial). */
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

type DecisionOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "decided"; cleaningTaskStatus: "rework" | "inspected"; unitStatus?: UnitStatus };

export async function decideReviewAction(
  input: unknown,
): Promise<ActionResult<{ cleaningTaskStatus: "rework" | "inspected" }>> {
  const parsed = ReviewDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const decision = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  // "approve" cobre as três decisões possíveis (aprovar/aprovar com observação/reprovar) — ver
  // comentário em packages/auth/src/abilities.ts sobre por que não existem abilities separadas.
  if (session.ability.cannot("approve", "cleaning_task")) {
    return { ok: false, error: "Sem permissão para decidir revisão de limpeza com o papel atual." };
  }

  try {
    const outcome = await withTenant<DecisionOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [taskRow] = await db
          .select()
          .from(cleaningTasks)
          .where(and(eq(cleaningTasks.id, decision.cleaningTaskId), eq(cleaningTasks.tenantId, session.tenantId)));

        if (!taskRow) {
          return { kind: "business-error", error: "Tarefa de limpeza não encontrada." };
        }
        if (taskRow.status !== "clean") {
          return {
            kind: "business-error",
            error: `Tarefa não está aguardando revisão (status atual: "${taskRow.status}").`,
          };
        }

        if (decision.decision === "reject") {
          await db.update(cleaningTasks).set({ status: "rework" }).where(eq(cleaningTasks.id, taskRow.id));
          return { kind: "decided", cleaningTaskStatus: "rework" };
        }

        // decision.decision === "approve" | "approve_with_note" — busca a evidência ATIVA
        // (não descartada) desta tarefa entre TODAS as linhas do tenant (mesma limitação de
        // performance documentada em ./queries.ts — `evidence_log` é uma cadeia por tenant, não
        // por tarefa).
        const evidenceRows = await db
          .select()
          .from(evidenceLog)
          .where(eq(evidenceLog.tenantId, session.tenantId));

        const chain: EvidenceEntry[] = evidenceRows
          .slice()
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
          .map(toEvidenceEntry);

        const activeLevels: AssuranceLevel[] = [];
        for (const row of evidenceRows) {
          if (row.kind !== "capture") continue;
          const envelope = row.envelope as { taskId?: string } | null;
          if (!envelope || envelope.taskId !== taskRow.id) continue;
          if (isDiscarded(chain, row.entryHash)) continue;
          activeLevels.push((row.assuranceLevel ?? "A0") as AssuranceLevel);
        }

        const level = lowestAssuranceLevel(activeLevels);

        try {
          // I10/seção 9.9 — regra do SERVIDOR, nunca contornável pela UI: mesmo com "aprovar"
          // clicado, a unidade só é liberada se a evidência sustentar a consequência financeira
          // "release_ready" (liberar unidade para venda). Se insuficiente, `enforceAssuranceLevel`
          // LANÇA `InsufficientAssuranceLevelError` e o catch abaixo devolve erro de negócio SEM
          // que qualquer UPDATE (`cleaning_tasks` ou `units`) tenha rodado ainda.
          enforceAssuranceLevel(level, "release_ready");
        } catch (err) {
          if (err instanceof InsufficientAssuranceLevelError) {
            return { kind: "business-error", error: err.message };
          }
          throw err;
        }

        // decision.note (quando decision === "approve_with_note") NÃO tem coluna própria em
        // `cleaning_tasks` (packages/db/src/schema/cleaning-task.ts não modela isto ainda) —
        // dívida técnica documentada, não escondida: o Zod aceita e valida o campo (obrigatório
        // quando decision==="reject", opcional aqui), mas ele se perde após esta Server Action até
        // uma coluna dedicada (`reviewNote`) existir. Fora do escopo desta faixa — packages/db não
        // pode ser tocado aqui (ver instruções desta tarefa).
        await db
          .update(cleaningTasks)
          .set({ status: "inspected", completedAt: new Date() })
          .where(eq(cleaningTasks.id, taskRow.id));

        const [unitRow] = await db.select().from(units).where(eq(units.id, taskRow.unitId));
        if (!unitRow) {
          throw new Error("Unidade da tarefa de limpeza não encontrada.");
        }

        // `transitionUnit` (packages/domain/src/unit/state-machine.ts) é a MESMA função usada em
        // todas as outras fases para mover `units.status` — nunca um UPDATE solto. Ela já define
        // tanto `clean -> ready` (fora da amostra de inspeção, seção 9.8.5) quanto
        // `inspected -> ready` como transições válidas, então funciona independente de qual dos
        // dois estados a unidade estiver quando a revisão chega aqui; lança `InvalidTransitionError`
        // (que sobe como erro de negócio claro via o catch externo) se a unidade estiver em
        // qualquer outro estado (já `ready`, `occupied`, `blocked` etc.).
        const nextUnitStatus = transitionUnit(unitRow.status as UnitStatus, "ready");
        await db.update(units).set({ status: nextUnitStatus }).where(eq(units.id, unitRow.id));

        return { kind: "decided", cleaningTaskStatus: "inspected", unitStatus: nextUnitStatus };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { cleaningTaskStatus: outcome.cleaningTaskStatus } };
  } catch (err) {
    return toActionError(err, "Falha ao decidir revisão de limpeza.");
  }
}
