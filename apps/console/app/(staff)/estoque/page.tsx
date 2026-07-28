// Painel de estoque e reposição preditiva (Fase 7, Passo 4c — docs/fase-atual.md, seção 9.7 do
// prompt único). Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo
// nesta máquina (Docker Desktop parado, "Gap conhecido 2"), então esta página Server Component
// não consulta `packages/db` para LER ainda — mesmo padrão de
// apps/console/app/(staff)/limpeza/page.tsx. Os cálculos abaixo (KPIs, ponto de reposição,
// badge de status) são, ainda assim, feitos DE VERDADE sobre a amostra com a MESMA lógica que uma
// query real (`./queries.ts::getStockBalancesWithItems()`) usaria — trocar a fonte é a única
// mudança necessária quando o banco estiver de pé.
//
// O CAMINHO DE ESCRITA (`recordStockMovementAction` — ./actions.ts, chamado pelo client component
// abaixo) já é real, contra o banco via `withTenant`.
import { KpiCard } from "@titan/ui";
import { computeReorderPoint, shouldTriggerReplenishment } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { StockBalanceTable, type StockRow } from "./StockBalanceTable";
import {
  ITEM_TYPE_LABEL,
  NOW_ANCHOR_EPOCH_MS,
  SAMPLE_AVG_DAILY_CONSUMPTION,
  SAMPLE_STOCK_BALANCES,
  SAMPLE_STOCK_ITEMS,
  SAMPLE_STOCK_MOVEMENTS,
  UNIT_LABEL,
} from "./sample-data";

function isSameUtcCalendarDay(a: Date, referenceEpochMs: number): boolean {
  const b = new Date(referenceEpochMs);
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

export default function EstoquePage() {
  // `rows` combina o catálogo (stock_items) com o saldo materializado (stock_balances) e o
  // consumo médio diário de amostra — mesmo shape que ./queries.ts::getStockBalancesWithItems()
  // devolveria (mais avgDailyConsumption, que ali viria de getRecentStockMovements sobre um
  // histórico real, ver comentário em ./sample-data.ts).
  const rows: StockRow[] = SAMPLE_STOCK_ITEMS.map((item) => {
    const balance = SAMPLE_STOCK_BALANCES.find((b) => b.unitId === item.unitId && b.itemType === item.itemType);
    const avgDailyConsumption = SAMPLE_AVG_DAILY_CONSUMPTION[`${item.unitId}:${item.itemType}`] ?? 0;
    return {
      unitId: item.unitId,
      unitLabel: UNIT_LABEL[item.unitId] ?? item.unitId,
      itemType: item.itemType,
      itemLabel: ITEM_TYPE_LABEL[item.itemType] ?? item.itemType,
      currentStockLevel: balance?.quantity ?? 0,
      minQuantity: item.minQuantity,
      leadTimeDays: item.leadTimeDays,
      safetyStockDays: item.safetyStockDays,
      avgDailyConsumption,
      updatedAt: balance?.updatedAt ?? new Date(NOW_ANCHOR_EPOCH_MS),
    };
  });

  const catalog = SAMPLE_STOCK_ITEMS.map((item) => ({
    unitId: item.unitId,
    unitLabel: UNIT_LABEL[item.unitId] ?? item.unitId,
    itemType: item.itemType,
    itemLabel: ITEM_TYPE_LABEL[item.itemType] ?? item.itemType,
  }));

  // KPI 1 — "Itens abaixo do mínimo": conta quantos pares (unidade, item) têm
  // shouldTriggerReplenishment(saldo_atual, computeReorderPoint(...)) verdadeiro. Decisão de
  // nome: "mínimo" aqui se refere ao PONTO DE REPOSIÇÃO calculado (a heurística determinística),
  // não à coluna `stock_items.min_quantity` (que é um piso cadastral manual, mostrado à parte na
  // tabela) — as duas noções de "mínimo" podem divergir por design, e o KPI usa a heurística por
  // ser a que de fato aciona a badge "Repor".
  const belowReorderPoint = rows.filter((row) => {
    const reorderPoint = computeReorderPoint({
      avgDailyConsumption: row.avgDailyConsumption,
      leadTimeDays: row.leadTimeDays,
      safetyStockDays: row.safetyStockDays,
    });
    return shouldTriggerReplenishment(row.currentStockLevel, reorderPoint);
  });

  // KPI 2 — "Movimentos hoje": conta `stock_movements` de amostra cujo `createdAt` cai no mesmo
  // dia civil UTC de NOW_ANCHOR_EPOCH_MS (mesma convenção de "hoje" de amostra determinística já
  // usada em apps/console/app/(staff)/limpeza/servicos/page.tsx).
  const movementsToday = SAMPLE_STOCK_MOVEMENTS.filter((m) => isSameUtcCalendarDay(m.createdAt, NOW_ANCHOR_EPOCH_MS));

  // KPI 4 — "Sugestões de reposição": DECISÃO DE DESIGN (não 100% especificada no plano) — usa a
  // MESMA contagem do KPI 1, porque nesta fase toda unidade/item que cruza o ponto de reposição
  // já É, por definição, a "sugestão" (não existe, nesta fase, um mecanismo de sugestão distinto
  // do próprio cálculo de computeReorderPoint/shouldTriggerReplenishment — não há ranking,
  // priorização por criticidade nem agrupamento por pedido de compra). Documentado aqui em vez de
  // inventar um número não derivado da mesma lógica.
  const replenishmentSuggestions = belowReorderPoint;

  return (
    <div className="p-6">
      <PageHeader title="Estoque" description="Saldos, movimentos, contagens, reposição preditiva." />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Itens abaixo do mínimo"
          value={String(belowReorderPoint.length)}
          trend={belowReorderPoint.length > 0 ? "down" : "flat"}
        />
        <KpiCard label="Movimentos hoje" value={String(movementsToday.length)} />
        {/* "Contagens pendentes": não há, nesta fase, o conceito de "contagem física de estoque"
            implementado (nenhuma tabela/fluxo de inventário físico periódico) — `state="empty"`
            em vez de inventar um número, mesma convenção de KpiCard usada em rotas anteriores
            quando o dado subjacente simplesmente não existe ainda. */}
        <KpiCard label="Contagens pendentes" state="empty" />
        <KpiCard
          label="Sugestões de reposição"
          value={String(replenishmentSuggestions.length)}
          trend={replenishmentSuggestions.length > 0 ? "down" : "flat"}
        />
      </div>

      <StockBalanceTable rows={rows} catalog={catalog} />
    </div>
  );
}
