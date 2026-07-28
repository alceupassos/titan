"use server";

// Server Actions da fila de OS técnica (Fase 6, Passo 4c — docs/fase-atual.md, seção 9.10.2 do
// prompt único). Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza (CASL)
// dentro dela mesma" — as duas ações abaixo fazem as duas coisas por conta própria, sem confiar em
// nenhuma checagem anterior (nem no `proxy.ts`). Mesmo estilo de
// apps/console/app/(staff)/fiscal/actions.ts e apps/console/app/(staff)/financeiro/actions.ts —
// leia os dois antes de mexer aqui.
//
// SCHEMA ZOD LOCAL (mesma decisão de design de ../checklists/actions.ts): nenhum schema em
// `packages/contracts` cobre abrir/transicionar uma OS técnica — fica local a este arquivo.
//
// `canTransitionWorkOrder`/`transitionWorkOrder` (`packages/domain/src/work-order/state-machine.ts`,
// FSM já existente desde a Fase 0) são o ÁRBITRO da transição — `transitionWorkOrderAction` NUNCA
// aceita um `toStatus` que a FSM não permita a partir do estado atual, mesmo que o Zod valide o
// valor como um `WorkOrderStatus` genérico isolado.
import { eq } from "drizzle-orm";
import { z } from "zod";
import { canTransitionWorkOrder, transitionWorkOrder, type WorkOrderStatus } from "@titan/domain";
import { units, vendors, withTenant, workOrders } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mesmo padrão de apps/console/app/(staff)/fiscal/actions.ts. */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

// Os 10 valores de ServiceType (packages/domain/src/housekeeping/checklist.ts) — mesma
// enumeração usada por ../checklists/actions.ts, reaproveitada aqui porque `work_orders` cobre o
// mesmo vocabulário de tipo de serviço da seção 9.8.4 (dedetização, ar-condicionado, manutenção
// corretiva etc.), não um vocabulário próprio.
const ServiceTypeSchema = z.enum([
  "limpeza_saida",
  "limpeza_intermediaria",
  "limpeza_profunda",
  "dedetizacao",
  "ar_condicionado",
  "piscina",
  "estofado",
  "jardinagem",
  "manutencao_corretiva",
  "vistoria",
]);

// Espelha `WorkOrderStatus` de packages/domain/src/work-order/state-machine.ts — os 11 valores da
// FSM (seção 9.10.2).
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

export const OpenWorkOrderSchema = z.object({
  unitId: z.string().uuid(),
  serviceType: ServiceTypeSchema,
  description: z.string().min(1, "Descrição da OS é obrigatória."),
  vendorId: z.string().uuid().optional(),
});
export type OpenWorkOrderInput = z.infer<typeof OpenWorkOrderSchema>;

export const TransitionWorkOrderSchema = z.object({
  workOrderId: z.string().uuid(),
  toStatus: WorkOrderStatusSchema,
});
export type TransitionWorkOrderInput = z.infer<typeof TransitionWorkOrderSchema>;

type OpenOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "created"; workOrderId: string };

/**
 * Abre uma nova OS técnica com `status: "opened"` — o único estado inicial válido da FSM
 * (packages/domain/src/work-order/state-machine.ts: `[*] --> opened` implícito, nunca outro).
 */
export async function openWorkOrderAction(input: unknown): Promise<ActionResult<{ workOrderId: string }>> {
  const parsed = OpenWorkOrderSchema.safeParse(input);
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

  if (session.ability.cannot("create", "work_order")) {
    return { ok: false, error: "Sem permissão para abrir ordem de serviço com o papel atual." };
  }

  try {
    const outcome = await withTenant<OpenOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [unitRow] = await db.select({ id: units.id }).from(units).where(eq(units.id, request.unitId));
        if (!unitRow) {
          return { kind: "business-error", error: "Unidade não encontrada." };
        }

        if (request.vendorId) {
          const [vendorRow] = await db
            .select({ id: vendors.id })
            .from(vendors)
            .where(eq(vendors.id, request.vendorId));
          if (!vendorRow) {
            return { kind: "business-error", error: "Prestador não encontrado." };
          }
        }

        const [row] = await db
          .insert(workOrders)
          .values({
            tenantId: session.tenantId,
            unitId: request.unitId,
            serviceType: request.serviceType,
            vendorId: request.vendorId ?? null,
            status: "opened",
            description: request.description,
          })
          .returning({ id: workOrders.id });

        if (!row) {
          throw new Error("INSERT de ordem de serviço não retornou id.");
        }

        return { kind: "created", workOrderId: row.id };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { workOrderId: outcome.workOrderId } };
  } catch (err) {
    return toActionError(err, "Falha ao abrir ordem de serviço.");
  }
}

type TransitionOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "transitioned"; status: WorkOrderStatus };

/**
 * Transiciona o `status` de uma OS já existente — `canTransitionWorkOrder`/`transitionWorkOrder`
 * (FSM do domínio) são checados ANTES de qualquer UPDATE: uma transição que a FSM não permite a
 * partir do estado atual da linha nunca chega a tocar o banco, mesmo que `toStatus` seja, isolado,
 * um `WorkOrderStatus` válido.
 */
export async function transitionWorkOrderAction(
  input: unknown,
): Promise<ActionResult<{ status: WorkOrderStatus }>> {
  const parsed = TransitionWorkOrderSchema.safeParse(input);
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

        const currentStatus = row.status as WorkOrderStatus;

        // O ÁRBITRO da transição é a FSM, não esta Server Action — `canTransitionWorkOrder` é
        // checado ANTES de qualquer UPDATE (mesmo espírito de I1: pré-check em memória nunca é o
        // único guarda, mas aqui É o guarda real, já que não há constraint de banco equivalente à
        // EXCLUDE para máquina de estados de texto livre).
        if (!canTransitionWorkOrder(currentStatus, request.toStatus)) {
          return {
            kind: "business-error",
            error: `Transição de "${currentStatus}" para "${request.toStatus}" não é permitida pela máquina de estados da OS.`,
          };
        }

        // `transitionWorkOrder` relança a mesma checagem e retorna o estado validado — nunca
        // confiamos só no "if" acima para decidir o valor gravado, mesmo domínio decide os dois.
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
