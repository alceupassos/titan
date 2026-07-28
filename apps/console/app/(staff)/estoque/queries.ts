// Caminho de LEITURA real do painel de estoque (Fase 7, Passo 4c — docs/fase-atual.md) —
// análogo ao caminho de escrita real que já existe em ./actions.ts enquanto a página só consegue
// RENDERIZAR a partir de amostra estática (./sample-data.ts): não há Postgres vivo nesta máquina
// (Docker Desktop parado — "Gap conhecido 2"), então nenhuma função abaixo foi exercitada contra
// um banco de verdade nesta sessão — mas o código é real, não mock, mesma técnica já descrita nos
// comentários de apps/console/app/(owner)/portal/queries.ts: "trocar a fonte por
// withTenant(...).select()... é a única mudança necessária, nunca a lógica de ./page.tsx".
import { and, eq, gte } from "drizzle-orm";
import { stockBalances, stockItems, stockMovements, withTenant } from "@titan/db";
import { requireStaffSession } from "@/lib/auth/session";

export interface StockBalanceWithItem {
  unitId: string;
  itemType: string;
  quantity: number;
  updatedAt: Date;
  minQuantity: number;
  leadTimeDays: number;
  safetyStockDays: number;
}

/**
 * Junta `stock_balances` com `stock_items` (mesma `unitId`+`itemType`) para a página ter
 * `minQuantity`/`leadTimeDays`/`safetyStockDays` junto com o saldo atual — os três últimos
 * alimentam `computeReorderPoint` (packages/domain/src/supply/stock.ts) junto com um
 * `avgDailyConsumption` calculado à parte (ver `getRecentStockMovements` abaixo). Um item
 * catalogado (`stock_items`) sem NENHUM movimento ainda (portanto sem linha em `stock_balances`)
 * não aparece aqui — mesma convenção de "nunca inventar um saldo" já usada no domínio
 * (`reconstructStockLevel` também trataria histórico vazio como saldo zero, mas a ausência de
 * uma linha materializada é tratada como "ainda não movimentado", não "saldo zero implícito").
 */
export async function getStockBalancesWithItems(): Promise<StockBalanceWithItem[]> {
  const session = await requireStaffSession();
  const rows = await withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db
      .select({
        unitId: stockBalances.unitId,
        itemType: stockBalances.itemType,
        quantity: stockBalances.quantity,
        updatedAt: stockBalances.updatedAt,
        minQuantity: stockItems.minQuantity,
        leadTimeDays: stockItems.leadTimeDays,
        safetyStockDays: stockItems.safetyStockDays,
      })
      .from(stockBalances)
      .innerJoin(
        stockItems,
        and(eq(stockItems.unitId, stockBalances.unitId), eq(stockItems.itemType, stockBalances.itemType)),
      ),
  );
  return rows;
}

/**
 * Movimentos de um par (unidade, item) desde `sinceEpochMs` — pensado para alimentar um
 * `avgDailyConsumption` REAL (soma de `consumption`/`quantity` no período dividido pelos dias do
 * período), no lugar do valor fixo de amostra usado hoje por ./sample-data.ts (ver comentário lá).
 * Não chamada por ./page.tsx nesta fase — reservada para quando o Postgres estiver de pé, mesmo
 * padrão de `getOwnerPayoutBatchById` em apps/console/app/(owner)/portal/queries.ts.
 */
export async function getRecentStockMovements(unitId: string, itemType: string, sinceEpochMs: number) {
  const session = await requireStaffSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db
      .select()
      .from(stockMovements)
      .where(
        and(
          eq(stockMovements.unitId, unitId),
          eq(stockMovements.itemType, itemType),
          gte(stockMovements.createdAt, new Date(sinceEpochMs)),
        ),
      ),
  );
}
