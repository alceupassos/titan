"use server";

// Server Action de cadastro de unidade (Planoexplica.md, "cadastrar unidade") — regra dura do
// CLAUDE.md raiz: valida (Zod) e autoriza (CASL) dentro de si mesma, nunca confia no `proxy.ts`.
// Mesmo template de simplicidade de apps/console/app/(staff)/estoque/actions.ts: um único INSERT
// via `withTenant`, sem transação composta.
import { CreateUnitSchema } from "@titan/contracts";
import { units, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

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

export async function createUnitAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateUnitSchema.safeParse(input);
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

  if (session.ability.cannot("create", "unit")) {
    return { ok: false, error: "Sem permissão para cadastrar unidade com o papel atual." };
  }

  try {
    const [row] = await withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
      db
        .insert(units)
        .values({
          tenantId: session.tenantId,
          name: request.name,
          status: request.status,
          areaSqm: request.areaSqm ?? null,
          maxCapacity: request.maxCapacity ?? null,
          category: request.category ?? null,
        })
        .returning({ id: units.id }),
    );

    if (!row) {
      return { ok: false, error: "Falha ao cadastrar unidade." };
    }

    return { ok: true, data: { id: row.id } };
  } catch (err) {
    return toActionError(err, "Falha ao cadastrar unidade.");
  }
}
