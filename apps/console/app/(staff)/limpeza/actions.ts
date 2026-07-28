"use server";

// Server Actions do quadro do dia de limpeza (Fase 6, Passo 4b — docs/fase-atual.md, seção 9.8
// do prompt único). Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza
// (CASL) dentro dela mesma" — as duas ações abaixo fazem as duas coisas por conta própria, sem
// confiar em nenhuma checagem anterior (nem no `proxy.ts`, que só confere presença de cookie —
// ver apps/console/proxy.ts e apps/console/lib/auth/session.ts). Mesmo estilo de
// apps/console/app/(staff)/distribuicao/actions.ts e
// apps/console/app/(staff)/limpeza/checklists/actions.ts — leia os dois antes de mexer aqui.
//
// SCHEMA ZOD LOCAL (mesma decisão de design já registrada em
// apps/console/app/(staff)/limpeza/checklists/actions.ts): `packages/contracts/src/
// housekeeping.ts` já existe (Fase 6, Passo 3), mas cobre só captura/revisão de evidência e
// submissão de checklist já preenchido — nenhum schema ali valida ATRIBUIR/REATRIBUIR uma
// `cleaning_task`. Como esta faixa está restrita a `apps/console/app/(staff)/limpeza/page.tsx` +
// arquivos próprios desta página e não pode tocar `packages/contracts` (fora do escopo declarado
// desta tarefa — outras faixas paralelas mexem em `checklists/`, `servicos/`, `revisao/` no mesmo
// momento; editar um arquivo compartilhado de `packages/contracts` correria o risco do
// anti-padrão #21), os schemas de validação ficam locais a este arquivo.
//
// I9 (packages/domain/src/unit/state-machine.ts): a tarefa de limpeza É a mesma máquina de
// estados da unidade — `units.status` é a fonte de verdade, não uma FSM paralela. Por isso
// `assignCleaningTaskAction` SEMPRE passa pelo `transitionUnit` do domínio antes de gravar
// `dirty -> cleaning`, nunca um UPDATE solto sem checar se a transição é válida.
import { and, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { transitionUnit, type UnitStatus } from "@titan/domain";
import { checklistTemplates, cleaningTasks, units, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const uuidSchema = z.string().uuid();

// `checklistTemplateId` é OPCIONAL de propósito: se o chamador não informar um explicitamente
// (a UI do quadro do dia não expõe um seletor de checklist — isso é `.../limpeza/checklists`,
// fora do escopo desta faixa), a Server Action resolve sozinha o template vigente mais recente
// para `serviceType = "limpeza_saida"`, em vez de bloquear o fluxo pedindo um id que a tela não
// coleta.
const AssignCleaningTaskSchema = z.object({
  unitId: uuidSchema,
  assignedTo: z.string().trim().min(1, "Responsável é obrigatório."),
  checklistTemplateId: uuidSchema.optional(),
});
export type AssignCleaningTaskInput = z.infer<typeof AssignCleaningTaskSchema>;

const ReassignCleaningTaskSchema = z.object({
  cleaningTaskId: uuidSchema,
  newAssignedTo: z.string().trim().min(1, "Responsável é obrigatório."),
});
export type ReassignCleaningTaskInput = z.infer<typeof ReassignCleaningTaskSchema>;

/** Mesmo padrão de apps/console/app/(staff)/distribuicao/actions.ts: erros de sessão/tenant e
 * qualquer `Error` de validação/domínio já chegam com mensagem pronta para exibição — nunca
 * deixamos uma exceção não tratada vazar para o cliente (o cliente só vê `ActionResult`). */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

type ChecklistTemplateRow = typeof checklistTemplates.$inferSelect;

type AssignOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "assigned"; cleaningTaskId: string };

/**
 * Atribui a virada de uma unidade `dirty` a um responsável, criando a `cleaning_task` e
 * transicionando `units.status: 'dirty' -> 'cleaning'`.
 *
 * A checagem "a unidade precisa estar 'dirty'" acontece ANTES de qualquer INSERT — não faz
 * sentido atribuir virada a uma unidade que não está suja (seção 9.8 do prompt único), e a
 * transição real de estado passa por `transitionUnit` (nunca um UPDATE solto), então uma unidade
 * fora de `dirty` já falha ali com `InvalidTransitionError` mesmo sem a checagem explícita — a
 * checagem explícita só existe para devolver uma mensagem de negócio clara em vez de vazar o
 * nome de uma classe de erro de domínio para a UI.
 */
export async function assignCleaningTaskAction(
  input: unknown,
): Promise<ActionResult<{ cleaningTaskId: string }>> {
  const parsed = AssignCleaningTaskSchema.safeParse(input);
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

  if (session.ability.cannot("create", "cleaning_task")) {
    return { ok: false, error: "Sem permissão para atribuir virada de limpeza com o papel atual." };
  }

  try {
    const outcome = await withTenant<AssignOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [unitRow] = await db.select().from(units).where(eq(units.id, request.unitId));
        if (!unitRow) {
          return { kind: "business-error", error: "Unidade não encontrada." };
        }
        if (unitRow.status !== "dirty") {
          return {
            kind: "business-error",
            error: `Unidade está em '${unitRow.status}', não 'dirty' — não é possível atribuir virada a uma unidade que não está suja.`,
          };
        }

        let templateRow: ChecklistTemplateRow | undefined;
        if (request.checklistTemplateId) {
          [templateRow] = await db
            .select()
            .from(checklistTemplates)
            .where(eq(checklistTemplates.id, request.checklistTemplateId));
          if (!templateRow) {
            return { kind: "business-error", error: "Checklist informado não encontrado." };
          }
        } else {
          const todayISO = new Date().toISOString().slice(0, 10);
          const candidates = await db
            .select()
            .from(checklistTemplates)
            .where(
              and(
                eq(checklistTemplates.serviceType, "limpeza_saida"),
                lte(checklistTemplates.validFrom, todayISO),
                gte(checklistTemplates.validTo, todayISO),
              ),
            );
          templateRow = candidates.reduce<ChecklistTemplateRow | undefined>(
            (latest, candidate) => (!latest || candidate.version > latest.version ? candidate : latest),
            undefined,
          );
          if (!templateRow) {
            return {
              kind: "business-error",
              error:
                "Nenhum checklist vigente para 'limpeza_saida' encontrado — cadastre um em /limpeza/checklists antes de iniciar a virada.",
            };
          }
        }

        // I9 — transição real via domínio, nunca um UPDATE solto. `unitRow.status` já foi
        // confirmado 'dirty' acima; `transitionUnit` é a mesma fonte de verdade usada por
        // check-in/check-out em qualquer outra parte do cockpit.
        let newStatus: UnitStatus;
        try {
          newStatus = transitionUnit(unitRow.status as UnitStatus, "cleaning");
        } catch (err) {
          return {
            kind: "business-error",
            error: err instanceof Error ? err.message : "Transição de estado inválida.",
          };
        }

        const [taskRow] = await db
          .insert(cleaningTasks)
          .values({
            tenantId: session.tenantId,
            unitId: request.unitId,
            checklistTemplateId: templateRow.id,
            checklistTemplateVersion: templateRow.version,
            assignedTo: request.assignedTo,
            status: "cleaning",
          })
          .returning({ id: cleaningTasks.id });

        if (!taskRow) {
          throw new Error("INSERT de cleaning_task não retornou id.");
        }

        await db.update(units).set({ status: newStatus }).where(eq(units.id, request.unitId));

        return { kind: "assigned", cleaningTaskId: taskRow.id };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { cleaningTaskId: outcome.cleaningTaskId } };
  } catch (err) {
    return toActionError(err, "Falha ao atribuir virada de limpeza.");
  }
}

type ReassignOutcome = { kind: "business-error"; error: string } | { kind: "reassigned" };

/**
 * Reatribui só o responsável de uma `cleaning_task` já existente — nunca muda `status` (isso é
 * responsabilidade de outra faixa: `.../checklists` submete o checklist preenchido,
 * `.../revisao/[taskId]` decide aprovar/reprovar).
 */
export async function reassignCleaningTaskAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = ReassignCleaningTaskSchema.safeParse(input);
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

  if (session.ability.cannot("update", "cleaning_task")) {
    return { ok: false, error: "Sem permissão para reatribuir virada de limpeza com o papel atual." };
  }

  try {
    const outcome = await withTenant<ReassignOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [row] = await db.select().from(cleaningTasks).where(eq(cleaningTasks.id, request.cleaningTaskId));
        if (!row) {
          return { kind: "business-error", error: "Tarefa de limpeza não encontrada." };
        }

        await db
          .update(cleaningTasks)
          .set({ assignedTo: request.newAssignedTo })
          .where(eq(cleaningTasks.id, row.id));

        return { kind: "reassigned" };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: "reassigned" } };
  } catch (err) {
    return toActionError(err, "Falha ao reatribuir virada de limpeza.");
  }
}
