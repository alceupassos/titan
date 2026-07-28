"use server";

// Server Action de registro de movimento de estoque (Fase 7, Passo 4c — docs/fase-atual.md,
// seção 9.7 do prompt único). Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e
// autoriza (CASL) dentro dela mesma" — a ação abaixo faz as duas coisas por conta própria, sem
// confiar em nenhuma checagem anterior (nem no `proxy.ts`). Mesmo estilo de
// apps/console/app/(staff)/limpeza/actions.ts e .../limpeza/servicos/actions.ts — leia os dois
// antes de mexer aqui.
//
// `RecordStockMovementSchema` já existe em packages/contracts/src/supply.ts (Fase 7, Passo 3) —
// reusado aqui, ao contrário da decisão local de ../limpeza/checklists/actions.ts, porque este
// schema JÁ cobre exatamente esta ação (nenhuma faixa paralela desta fase depende dele para outra
// coisa incompatível).
import { and, eq } from "drizzle-orm";
import { reconstructStockLevel, type StockMovement as DomainStockMovement } from "@titan/domain";
import { RecordStockMovementSchema } from "@titan/contracts";
import { stockBalances, stockMovements, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mesmo padrão de apps/console/app/(staff)/limpeza/actions.ts. */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

type RecordOutcome = { kind: "recorded"; newStockLevel: number };

/**
 * Registra um novo `stock_movement` e atualiza `stock_balances` (materializado) na MESMA
 * transação — mesmo padrão de dois-inserts-relacionados de `assignCleaningTaskAction`
 * (apps/console/app/(staff)/limpeza/actions.ts: lá cria `cleaning_tasks` + transiciona
 * `units.status`; aqui insere em `stock_movements` + faz UPSERT em `stock_balances`).
 *
 * O novo saldo NUNCA é uma soma isolada do movimento novo sobre o saldo antigo — é sempre
 * `reconstructStockLevel` (packages/domain/src/supply/stock.ts) aplicado ao HISTÓRICO COMPLETO
 * de `stock_movements` daquele par (unitId, itemType), incluindo o movimento recém-inserido. Isso
 * reusa a MESMA regra de direção do domínio (purchase/adjustment/return somam;
 * consumption/loss subtraem) em vez de reimplementá-la aqui com um sinal próprio — os dois nunca
 * podem divergir, porque só existe um lugar onde a regra de sinal é definida. É exatamente a
 * prova que o portão de saída da Fase 7 exige: "saldo reconstruído dos movimentos bate com saldo
 * materializado" (docs/roadmap.md).
 */
export async function recordStockMovementAction(input: unknown): Promise<ActionResult<{ newStockLevel: number }>> {
  const parsed = RecordStockMovementSchema.safeParse(input);
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

  if (session.ability.cannot("create", "stock_movement")) {
    return { ok: false, error: "Sem permissão para registrar movimento de estoque com o papel atual." };
  }

  try {
    const outcome = await withTenant<RecordOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        await db.insert(stockMovements).values({
          tenantId: session.tenantId,
          unitId: request.unitId,
          itemType: request.itemType,
          type: request.type,
          quantity: request.quantity,
          reference: request.reference ?? null,
        });

        const historyRows = await db
          .select({
            unitId: stockMovements.unitId,
            itemType: stockMovements.itemType,
            type: stockMovements.type,
            quantity: stockMovements.quantity,
          })
          .from(stockMovements)
          .where(and(eq(stockMovements.unitId, request.unitId), eq(stockMovements.itemType, request.itemType)));

        const domainMovements: DomainStockMovement[] = historyRows.map((row) => ({
          unitId: row.unitId,
          itemType: row.itemType,
          type: row.type as DomainStockMovement["type"],
          quantity: row.quantity,
        }));

        const newStockLevel = reconstructStockLevel(domainMovements);

        // UPSERT sobre `stock_balances_unit_item_key UNIQUE (unit_id, item_type)`
        // (packages/db/migrations/0008_supply_vendors.sql) — se não houver linha ainda para este
        // par, o "saldo anterior" é 0 por definição (reconstructStockLevel de um histórico
        // começando agora já cobre isso, sem precisar de um caso especial aqui).
        await db
          .insert(stockBalances)
          .values({
            tenantId: session.tenantId,
            unitId: request.unitId,
            itemType: request.itemType,
            quantity: newStockLevel,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [stockBalances.unitId, stockBalances.itemType],
            set: { quantity: newStockLevel, updatedAt: new Date() },
          });

        return { kind: "recorded", newStockLevel };
      },
    );

    return { ok: true, data: { newStockLevel: outcome.newStockLevel } };
  } catch (err) {
    return toActionError(err, "Falha ao registrar movimento de estoque.");
  }
}
