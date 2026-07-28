// Dados de amostra para o painel de estoque e reposição preditiva (Fase 7, Passo 4c —
// docs/fase-atual.md). NÃO há Postgres vivo nesta máquina (Docker Desktop parado — "Gap
// conhecido 2"), então ./page.tsx não consulta `packages/db` para LER — mesmo espírito de
// apps/console/app/(staff)/limpeza/sample-data.ts e .../servicos/sample-data.ts. Os tipos aqui
// são os MESMOS tipos de linha crua do Drizzle (`typeof stockItems.$inferSelect`, etc.), não uma
// interface solta reinventada, para que trocar por `./queries.ts::getStockBalancesWithItems()`
// seja só trocar a fonte, nunca o formato consumido por ./page.tsx/./StockBalanceTable.tsx.
//
// O CAMINHO DE ESCRITA (`recordStockMovementAction`, ./actions.ts, chamado por
// ./StockBalanceTable.tsx) já é real, contra o banco via `withTenant` — chamar a partir desta
// amostra tenta o Postgres de verdade e, sem Docker rodando, falha com erro de conexão (mesmo
// comportamento hoje de apps/console/app/(staff)/limpeza).
//
// Determinístico de propósito (sem `Date.now()`) — mesma âncora de tempo usada em
// apps/console/app/(staff)/limpeza/sample-data.ts, para o preview renderizar sempre igual.
import type { stockBalances, stockItems, stockMovements } from "@titan/db";

const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra das demais rotas.

// Mesmos ids de unidade de apps/console/app/(staff)/limpeza/sample-data.ts, para o cockpit
// inteiro renderizar com o mesmo "mundo" de amostra.
export const UNIT_STUDIO = "a0000000-0000-4000-8000-000000000001"; // Studio Vista Mar 101
export const UNIT_JARDINS = "a0000000-0000-4000-8000-000000000002"; // Apartamento Jardins 202
export const UNIT_LOFT = "a0000000-0000-4000-8000-000000000003"; // Loft Centro 401

export const UNIT_LABEL: Record<string, string> = {
  [UNIT_STUDIO]: "Studio Vista Mar 101",
  [UNIT_JARDINS]: "Apartamento Jardins 202",
  [UNIT_LOFT]: "Loft Centro 401",
};

// 2 tipos de item de enxoval — docs/decisoes-de-negocio.md pergunta 7 (confirmada: o enxoval é
// do PROPRIETÁRIO de cada unidade, não da Titan — por isso o catálogo é por unidade, nunca um
// pool central).
export const ITEM_LENCOL_CASAL = "lencol_casal";
export const ITEM_TOALHA_BANHO = "toalha_banho";

export const ITEM_TYPE_LABEL: Record<string, string> = {
  [ITEM_LENCOL_CASAL]: "Lençol de casal",
  [ITEM_TOALHA_BANHO]: "Toalha de banho",
};

// Mesma âncora de "agora" usada em apps/console/app/(staff)/limpeza/sample-data.ts e
// .../servicos/sample-data.ts, para os painéis renderizarem com o mesmo relógio de amostra.
export const NOW_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T14:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type StockItemRow = typeof stockItems.$inferSelect;
type StockBalanceRow = typeof stockBalances.$inferSelect;
type StockMovementRow = typeof stockMovements.$inferSelect;

// Catálogo de amostra — 5 pares (unidade, item), cobrindo os dois casos do portão de saída desta
// faixa (alguns abaixo do ponto de reposição, alguns acima). Loft só cadastra lençol de casal
// nesta amostra (documenta que nem toda unidade precisa ter os 2 tipos catalogados — o catálogo é
// por unidade, não uma matriz obrigatória).
export const SAMPLE_STOCK_ITEMS: readonly StockItemRow[] = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    itemType: ITEM_LENCOL_CASAL,
    minQuantity: 4,
    leadTimeDays: 3,
    safetyStockDays: 2,
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    itemType: ITEM_TOALHA_BANHO,
    minQuantity: 6,
    leadTimeDays: 2,
    safetyStockDays: 2,
  },
  {
    id: "d0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    itemType: ITEM_LENCOL_CASAL,
    minQuantity: 4,
    leadTimeDays: 3,
    safetyStockDays: 1,
  },
  {
    id: "d0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    itemType: ITEM_TOALHA_BANHO,
    minQuantity: 6,
    leadTimeDays: 2,
    safetyStockDays: 3,
  },
  {
    id: "d0000000-0000-4000-8000-000000000005",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    itemType: ITEM_LENCOL_CASAL,
    minQuantity: 4,
    leadTimeDays: 4,
    safetyStockDays: 2,
  },
];

// Saldo materializado de amostra — consistente com a soma dos movimentos abaixo (nunca um número
// solto): Studio/lençol 10-8=2, Studio/toalha 12-4=8, Jardins/lençol 8-2=6, Jardins/toalha
// 6-3=3, Loft/lençol 5-4=1.
export const SAMPLE_STOCK_BALANCES: readonly StockBalanceRow[] = [
  {
    id: "e0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    itemType: ITEM_LENCOL_CASAL,
    quantity: 2,
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 4 * HOUR_MS),
  },
  {
    id: "e0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    itemType: ITEM_TOALHA_BANHO,
    quantity: 8,
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 3 * HOUR_MS),
  },
  {
    id: "e0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    itemType: ITEM_LENCOL_CASAL,
    quantity: 6,
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * DAY_MS),
  },
  {
    id: "e0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    itemType: ITEM_TOALHA_BANHO,
    quantity: 3,
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 2 * DAY_MS),
  },
  {
    id: "e0000000-0000-4000-8000-000000000005",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    itemType: ITEM_LENCOL_CASAL,
    quantity: 1,
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 3 * HOUR_MS),
  },
];

// Movimentos de amostra que somam exatamente aos saldos acima (reconstructStockLevel(...) sobre
// esta lista, filtrada por unitId+itemType, bate com SAMPLE_STOCK_BALANCES — mesma prova que o
// portão de saída da fase exige contra o banco real). 3 movimentos caem em "hoje"
// (NOW_ANCHOR_EPOCH_MS): as duas baixas de consumo do Studio e a perda do Loft.
export const SAMPLE_STOCK_MOVEMENTS: readonly StockMovementRow[] = [
  {
    id: "f0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    itemType: ITEM_LENCOL_CASAL,
    type: "purchase",
    quantity: 10,
    reference: { note: "Compra inicial de enxoval" },
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 10 * DAY_MS),
  },
  {
    id: "f0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    itemType: ITEM_LENCOL_CASAL,
    type: "consumption",
    quantity: 8,
    reference: { cleaningTaskId: "b0000000-0000-4000-8000-000000000002" },
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 4 * HOUR_MS), // hoje
  },
  {
    id: "f0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    itemType: ITEM_TOALHA_BANHO,
    type: "purchase",
    quantity: 12,
    reference: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 8 * DAY_MS),
  },
  {
    id: "f0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    itemType: ITEM_TOALHA_BANHO,
    type: "consumption",
    quantity: 4,
    reference: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 3 * HOUR_MS), // hoje
  },
  {
    id: "f0000000-0000-4000-8000-000000000005",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    itemType: ITEM_LENCOL_CASAL,
    type: "purchase",
    quantity: 8,
    reference: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 12 * DAY_MS),
  },
  {
    id: "f0000000-0000-4000-8000-000000000006",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    itemType: ITEM_LENCOL_CASAL,
    type: "consumption",
    quantity: 2,
    reference: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * DAY_MS),
  },
  {
    id: "f0000000-0000-4000-8000-000000000007",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    itemType: ITEM_TOALHA_BANHO,
    type: "purchase",
    quantity: 6,
    reference: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 9 * DAY_MS),
  },
  {
    id: "f0000000-0000-4000-8000-000000000008",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    itemType: ITEM_TOALHA_BANHO,
    type: "consumption",
    quantity: 3,
    reference: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 2 * DAY_MS),
  },
  {
    id: "f0000000-0000-4000-8000-000000000009",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    itemType: ITEM_LENCOL_CASAL,
    type: "purchase",
    quantity: 5,
    reference: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 20 * DAY_MS),
  },
  {
    id: "f0000000-0000-4000-8000-000000000010",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    itemType: ITEM_LENCOL_CASAL,
    type: "loss",
    quantity: 4,
    reference: { note: "Enxoval danificado por hóspede — dossiê de sinistro fora do escopo desta faixa" },
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 3 * HOUR_MS), // hoje
  },
];

// `avgDailyConsumption` de AMOSTRA — valor FIXO por (unidade, item), não derivado dos movimentos
// acima. A versão real usaria ./queries.ts::getRecentStockMovements(unitId, itemType, since) para
// calcular a média histórica de consumo diário; a amostra usa um número fixo plausível só para
// exercitar a UI (computeReorderPoint/shouldTriggerReplenishment, packages/domain/src/supply/
// stock.ts), documentado aqui em vez de escondido.
export const SAMPLE_AVG_DAILY_CONSUMPTION: Record<string, number> = {
  [`${UNIT_STUDIO}:${ITEM_LENCOL_CASAL}`]: 0.6,
  [`${UNIT_STUDIO}:${ITEM_TOALHA_BANHO}`]: 1.2,
  [`${UNIT_JARDINS}:${ITEM_LENCOL_CASAL}`]: 0.5,
  [`${UNIT_JARDINS}:${ITEM_TOALHA_BANHO}`]: 1.0,
  [`${UNIT_LOFT}:${ITEM_LENCOL_CASAL}`]: 0.7,
};
