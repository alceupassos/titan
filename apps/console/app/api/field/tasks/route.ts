// Route Handler consumido pelo app de campo (apps/field/lib/api-client.ts::fetchFieldTasks) —
// Fase 9, Passo 5. Endpoints HTTP, não Server Actions, porque um app nativo (Expo) não pode
// invocar Server Actions do Next diretamente. Regra dura do CLAUDE.md raiz: "Toda Server Action
// valida (Zod) e autoriza (CASL) dentro dela mesma" — mesmo princípio aplicado a um Route Handler:
// sessão + ability checadas aqui, nunca delegadas ao `proxy.ts` (que só confere presença de
// cookie).
//
// Reusa as tabelas/tipos já reais desde a Fase 6 (cleaning_tasks/checklist_templates) — nunca uma
// segunda fonte de dado de tarefa criada só para o app de campo. `assignedTo` (cleaning_tasks) é
// texto livre (sem vínculo formal — pergunta 3 de docs/decisoes-de-negocio.md segue pendente); o
// `memberId` do app de campo é comparado contra esse campo como STRING, mesma convenção.
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { checklistTemplates, cleaningTasks, units, withTenant } from "@titan/db";
import { NoActiveTenantError, requireFieldSession, UnauthenticatedError } from "@/lib/auth/field-session";

interface ChecklistSectionShape {
  readonly items: readonly { readonly id: string; readonly label: string; readonly type: string }[];
}

function toActionError(err: unknown): { status: number; error: string } {
  if (err instanceof UnauthenticatedError) return { status: 401, error: err.message };
  if (err instanceof NoActiveTenantError) return { status: 403, error: err.message };
  if (err instanceof Error) return { status: 500, error: err.message };
  return { status: 500, error: "Falha ao carregar tarefas do dia." };
}

export async function GET(request: Request): Promise<Response> {
  const memberId = new URL(request.url).searchParams.get("memberId");
  if (!memberId) {
    return NextResponse.json({ error: "Parâmetro 'memberId' é obrigatório." }, { status: 400 });
  }

  let session;
  try {
    session = await requireFieldSession();
  } catch (err) {
    const { status, error } = toActionError(err);
    return NextResponse.json({ error }, { status });
  }

  if (session.ability.cannot("read", "cleaning_task")) {
    return NextResponse.json({ error: "Sem permissão para ler tarefas com o papel atual." }, { status: 403 });
  }

  try {
    const rows = await withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
      db
        .select({
          taskId: cleaningTasks.id,
          unitId: cleaningTasks.unitId,
          unitName: units.name,
          sections: checklistTemplates.sections,
        })
        .from(cleaningTasks)
        .innerJoin(units, eq(units.id, cleaningTasks.unitId))
        .innerJoin(checklistTemplates, eq(checklistTemplates.id, cleaningTasks.checklistTemplateId))
        .where(and(eq(cleaningTasks.assignedTo, memberId), eq(cleaningTasks.status, "cleaning"))),
    );

    const tasks = rows.map((row) => {
      const sections = row.sections as ChecklistSectionShape[];
      const checklistItems = sections.flatMap((section) =>
        section.items.map((item) => ({
          itemId: item.id,
          label: item.label,
          requiresPhoto: item.type === "photo",
        })),
      );
      return { taskId: row.taskId, unitId: row.unitId, unitName: row.unitName, checklistItems };
    });

    return NextResponse.json(tasks);
  } catch (err) {
    const { status, error } = toActionError(err);
    return NextResponse.json({ error }, { status });
  }
}
