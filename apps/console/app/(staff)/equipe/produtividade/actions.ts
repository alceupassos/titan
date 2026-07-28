"use server";

// Server Action de registro de conclusão de tarefa (Fase 9, Passo 4c — docs/fase-atual.md).
// Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza (CASL) dentro dela
// mesma" — mesmo template de simplicidade de
// apps/console/app/(staff)/estoque/actions.ts::recordStockMovementAction (insere um registro
// simples via `withTenant`+Zod+CASL, sem lógica de transação complexa — aqui nem precisa de um
// segundo UPSERT relacionado, porque não existe saldo materializado para produtividade nesta
// fase: `computeProductivityScore`/`flagSuspiciousCompletions` recalculam tudo em memória a partir
// do histórico completo, lido por ./queries.ts).
//
// `RecordTaskCompletionSchema` já existe em packages/contracts/src/workforce.ts (Fase 9, Passo 3)
// — reusado aqui, mesma decisão de reuso já usada por recordStockMovementAction.
import { RecordTaskCompletionSchema } from "@titan/contracts";
import { taskCompletionRecords, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mesmo padrão de apps/console/app/(staff)/estoque/actions.ts. */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

/**
 * Insere um novo `task_completion_record`. NUNCA bloqueia por causa de sinalização de possível
 * reuso de evidência — `flagSuspiciousCompletions` só é chamado no caminho de LEITURA
 * (./page.tsx, sobre o histórico completo já persistido), nunca aqui: o registro em si sempre é
 * aceito quando válido/autorizado, a sinalização é só para revisão humana posterior (mesmo
 * espírito de `enforceAssuranceLevel` — "não bloqueia o trabalho, sinaliza a consequência").
 */
export async function recordTaskCompletionAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = RecordTaskCompletionSchema.safeParse(input);
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

  if (session.ability.cannot("create", "task_completion_record")) {
    return { ok: false, error: "Sem permissão para registrar conclusão de tarefa com o papel atual." };
  }

  try {
    const [row] = await withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
      db
        .insert(taskCompletionRecords)
        .values({
          tenantId: session.tenantId,
          memberId: request.memberId,
          taskId: request.taskId,
          evidenceHashes: request.evidenceHashes,
        })
        .returning({ id: taskCompletionRecords.id }),
    );

    if (!row) {
      return { ok: false, error: "Falha ao registrar conclusão de tarefa." };
    }

    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return toActionError(err, "Falha ao registrar conclusão de tarefa.");
  }
}
