"use server";

// Server Action de transição de OS pelo Portal do Prestador (Fase 7, Passo 4a —
// docs/fase-atual.md). Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza
// (CASL) dentro dela mesma" — segue exatamente o padrão de
// apps/console/app/(staff)/limpeza/servicos/actions.ts (`transitionWorkOrderAction`), com uma
// checagem adicional própria deste portal: um prestador só pode transicionar a OS que É DELE.
//
// `canTransitionWorkOrder`/`transitionWorkOrder` (`packages/domain/src/work-order/state-machine.ts`,
// FSM já existente desde a Fase 0) seguem sendo o ÚNICO árbitro de transição válida — esta ação
// NUNCA aceita um `toStatus` que a FSM não permita a partir do estado atual da linha, mesmo que o
// Zod valide o valor isolado como um `WorkOrderStatus` genérico.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canTransitionWorkOrder, transitionWorkOrder, type WorkOrderStatus } from "@titan/domain";
import { withTenant, workOrders } from "@titan/db";
import { NoActiveTenantError, requireVendorSession, UnauthenticatedError } from "@/lib/auth/vendor-session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mesmo padrão de apps/console/app/(staff)/limpeza/servicos/actions.ts. */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

// Espelha `WorkOrderStatus` de packages/domain/src/work-order/state-machine.ts — os 11 valores da
// FSM (seção 9.10.2), mesma enumeração usada em .../limpeza/servicos/actions.ts.
const WorkOrderStatusSchema = z.enum([
  "opened",
  "triage",
  "budget",
  "dispatched",
  "accepted_vendor",
  "executing",
  "accepted_titan",
  "rework",
  "billed",
  "paid",
  "rated",
]);

export const VendorTransitionWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  toStatus: WorkOrderStatusSchema,
  // LACUNA CONHECIDA (apps/console/lib/auth/vendor-session.ts): sem mapeamento persistido
  // usuário -> prestador, não há como esta Server Action descobrir sozinha "qual prestador é o
  // usuário desta sessão" — o vendorId chega aqui como parâmetro EXPLÍCITO do chamador, nunca
  // inferido da sessão. A checagem `row.vendorId === vendorId` abaixo é o que impede um prestador
  // de transicionar a OS de outro, mas não impede (até aquele bounded context nascer) que o
  // CHAMADOR informe um vendorId que não é o seu — ver a lacuna completa no cabeçalho de
  // vendor-session.ts.
  vendorId: z.string().uuid(),
});
export type VendorTransitionWorkOrderInput = z.infer<typeof VendorTransitionWorkOrderSchema>;

type TransitionOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "transitioned"; status: WorkOrderStatus };

/**
 * Transiciona o `status` de uma OS já existente, restrito ao prestador informado.
 * `canTransitionWorkOrder`/`transitionWorkOrder` são checados ANTES de qualquer UPDATE — uma
 * transição que a FSM não permite a partir do estado atual da linha nunca chega a tocar o banco,
 * mesmo que `toStatus` seja, isolado, um `WorkOrderStatus` válido. Adicionalmente (e antes até de
 * checar a FSM), a OS precisa pertencer ao `vendorId` informado — um prestador nunca transiciona a
 * OS de outro prestador, mesmo que a transição em si fosse válida pela FSM.
 */
export async function vendorTransitionWorkOrderAction(
  input: unknown,
): Promise<ActionResult<{ status: WorkOrderStatus }>> {
  const parsed = VendorTransitionWorkOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let session;
  try {
    session = await requireVendorSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  // TODO (Fase 7, Passo 4b — packages/auth/src/abilities.ts): esta faixa adicionou
  // `can(["read","update"], "work_order")` ao papel "vendor" para que esta checagem já tenha uma
  // ability real para consultar. Se a faixa 4b (motor de retenção/cadastro de prestador) também
  // tocar o case "vendor" de abilities.ts concorrentemente, o Passo 5 de integração final
  // reconcilia as duas edições — mesmo padrão já usado com sucesso nas Fases 3 e 6.
  if (session.ability.cannot("update", "work_order")) {
    return { ok: false, error: "Sem permissão para transicionar ordem de serviço com o papel atual." };
  }

  try {
    const outcome = await withTenant<TransitionOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [row] = await db.select().from(workOrders).where(eq(workOrders.id, request.workOrderId));
        if (!row) {
          return { kind: "business-error", error: "Ordem de serviço não encontrada." };
        }

        // Um prestador NUNCA transiciona a OS de outro prestador — checado antes de qualquer
        // outra coisa, mesmo antes da FSM (ver lacuna de mapeamento usuário -> prestador acima:
        // este é o único guarda real disponível hoje, até esse bounded context nascer).
        if (row.vendorId !== request.vendorId) {
          return {
            kind: "business-error",
            error: "Esta ordem de serviço não está atribuída a este prestador — transição recusada.",
          };
        }

        const currentStatus = row.status as WorkOrderStatus;

        // O ÁRBITRO da transição é a FSM, não esta Server Action — `canTransitionWorkOrder` é
        // checado ANTES de qualquer UPDATE (mesmo espírito de
        // .../limpeza/servicos/actions.ts::transitionWorkOrderAction).
        if (!canTransitionWorkOrder(currentStatus, request.toStatus)) {
          return {
            kind: "business-error",
            error: `Transição de "${currentStatus}" para "${request.toStatus}" não é permitida pela máquina de estados da OS.`,
          };
        }

        // `transitionWorkOrder` relança a mesma checagem e retorna o estado validado — nunca
        // confiamos só no "if" acima para decidir o valor gravado.
        const nextStatus = transitionWorkOrder(currentStatus, request.toStatus);

        await db
          .update(workOrders)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(workOrders.id, row.id));

        return { kind: "transitioned", status: nextStatus };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: outcome.status } };
  } catch (err) {
    return toActionError(err, "Falha ao transicionar ordem de serviço.");
  }
}
