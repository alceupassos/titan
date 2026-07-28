// Dados de amostra para a fila de OS técnica (Fase 6, Passo 4c — docs/fase-atual.md). NÃO há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2"), então esta rota não
// consulta `packages/db` para LER. Mesmo espírito de apps/console/app/(staff)/fiscal/sample-data.ts:
// o tipo aqui é o MESMO tipo de linha crua do Drizzle (`typeof workOrders.$inferSelect`) — trocar
// por uma query real é só trocar a fonte dos dados, nunca o formato consumido pela página/pelo
// client component.
//
// O CAMINHO DE ESCRITA (`openWorkOrderAction`, `transitionWorkOrderAction` — ./actions.ts) é real,
// contra o banco via `withTenant` — chamar a partir desta amostra tenta o Postgres de verdade e,
// sem Docker rodando, falha com erro de conexão.
//
// Determinístico de propósito (sem `Date.now()`) — mesma âncora de tempo usada em
// apps/console/app/(staff)/fiscal/sample-data.ts, para o preview renderizar sempre igual.
import type { workOrders } from "@titan/db";

const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra das outras rotas.

const UNIT_STUDIO = "a0000000-0000-4000-8000-000000000001"; // Studio Vista Mar 101
const UNIT_JARDINS = "a0000000-0000-4000-8000-000000000002"; // Apartamento Jardins 202
const UNIT_LOFT = "a0000000-0000-4000-8000-000000000003"; // Loft Centro 401
const UNIT_CASA = "a0000000-0000-4000-8000-000000000004"; // Casa de Praia Enseada

const VENDOR_MANUTENCAO = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b02"; // Manutenção Predial Sul

const NOW_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T14:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type WorkOrderRow = typeof workOrders.$inferSelect;

export const UNIT_LABEL: Record<string, string> = {
  [UNIT_STUDIO]: "Studio Vista Mar 101",
  [UNIT_JARDINS]: "Apartamento Jardins 202",
  [UNIT_LOFT]: "Loft Centro 401",
  [UNIT_CASA]: "Casa de Praia Enseada",
};

export const SAMPLE_WORK_ORDERS: readonly WorkOrderRow[] = [
  {
    id: "w0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    serviceType: "ar_condicionado",
    vendorId: null,
    status: "opened",
    description: "Ar-condicionado não gela — hóspede reportou no check-in.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 2 * HOUR_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 2 * HOUR_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    serviceType: "dedetizacao",
    vendorId: VENDOR_MANUTENCAO,
    status: "dispatched",
    description: "Dedetização trimestral programada — seção 9.8.4.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 3 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 1 * DAY_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    serviceType: "manutencao_corretiva",
    vendorId: VENDOR_MANUTENCAO,
    status: "executing",
    description: "Substituição de chuveiro elétrico com defeito.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 4 * HOUR_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    unitId: UNIT_CASA,
    serviceType: "piscina",
    vendorId: null,
    status: "rework",
    description: "Tratamento químico reprovado na vistoria — água ainda turva.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 6 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 12 * HOUR_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000005",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    serviceType: "estofado",
    vendorId: VENDOR_MANUTENCAO,
    status: "billed",
    description: "Higienização de estofado do sofá — pós check-out com mancha.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 10 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 2 * DAY_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000006",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    serviceType: "jardinagem",
    vendorId: null,
    status: "paid",
    description: "Poda mensal da varanda/jardim externo.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 15 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * DAY_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000007",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    serviceType: "vistoria",
    vendorId: null,
    status: "rated",
    description: "Vistoria trimestral de manutenção preventiva — sem pendências.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 20 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 8 * DAY_MS),
  },
];
