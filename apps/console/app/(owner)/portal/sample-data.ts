// Dados de amostra do Owner Portal (Fase 5, Passo 4c — docs/fase-atual.md). NÃO há Postgres vivo
// nesta máquina (Docker Desktop parado — "Gap conhecido 2" de docs/fase-atual.md), então estas
// rotas Server Component não consultam `packages/db` para LER ainda — mesmo padrão de
// apps/console/app/(staff)/fiscal/sample-data.ts e .../distribuicao/sample-data.ts. Os tipos aqui
// são os MESMOS tipos de linha crua do Drizzle (`typeof units.$inferSelect`,
// `typeof administrationContracts.$inferSelect`, `typeof payoutBatches.$inferSelect`), não
// interfaces soltas reinventadas — trocar por uma query real (`./queries.ts`, já escrita e real,
// só não exercitada nesta sessão) é só trocar a fonte dos dados, nunca o formato consumido pelas
// páginas.
//
// Unidades e ids reaproveitados de apps/console/app/(staff)/reservas/nova/sample-data.ts (mesmo
// tenant/mundo de amostra do resto do cockpit) — "Loft Centro 401" e "Apartamento Jardins 202" já
// existem lá com os mesmos uuids, então esta amostra é coerente com o resto do preview.
//
// Determinístico de propósito (sem `Date.now()`) — mesma âncora de tempo ("2026-07-28T14:00:00Z")
// já usada em apps/console/app/(staff)/fiscal/sample-data.ts e .../distribuicao/sample-data.ts,
// para o preview renderizar sempre igual.
import type { administrationContracts, payoutBatches, units } from "@titan/db";

export const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra das outras rotas.

export const UNIT_JARDINS_ID = "a0000000-0000-4000-8000-000000000002"; // "Apartamento Jardins 202"
export const UNIT_LOFT_ID = "a0000000-0000-4000-8000-000000000003"; // "Loft Centro 401"

export const NOW_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T14:00:00Z");

type UnitRow = typeof units.$inferSelect;
type AdministrationContractRow = typeof administrationContracts.$inferSelect;
type PayoutBatchRow = typeof payoutBatches.$inferSelect;

/** Unidades sob gestão do proprietário desta sessão de amostra. LACUNA CONHECIDA (ver
 * apps/console/lib/auth/owner-session.ts): sem `ownership_share` persistida, uma query real
 * filtraria só por `tenantId` — "as unidades deste proprietário" é, hoje, uma decisão de amostra,
 * não o resultado de um filtro de propriedade de verdade. */
export const SAMPLE_OWNER_UNITS: readonly UnitRow[] = [
  {
    id: UNIT_JARDINS_ID,
    tenantId: TENANT_ID,
    name: "Apartamento Jardins 202",
    status: "ready",
    areaSqm: null,
    maxCapacity: null,
    category: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 200 * 24 * 60 * 60 * 1000),
  },
  {
    id: UNIT_LOFT_ID,
    tenantId: TENANT_ID,
    name: "Loft Centro 401",
    status: "ready",
    areaSqm: null,
    maxCapacity: null,
    category: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 200 * 24 * 60 * 60 * 1000),
  },
];

// Comissão sempre sobre a receita BRUTA (docs/decisoes-de-negocio.md, pergunta 4, confirmada).
// Jardins: "titan_pays_all" (itens operacionais embutidos na comissão, sem despesa itemizada no
// extrato). Loft: "owner_pays_itemized" (proprietário paga, Titan rateia e desconta do repasse).
export const SAMPLE_ADMINISTRATION_CONTRACTS: readonly AdministrationContractRow[] = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS_ID,
    commissionBasisPoints: 2500, // 25,00%
    itemPaymentModel: "titan_pays_all",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT_ID,
    commissionBasisPoints: 2000, // 20,00%
    itemPaymentModel: "owner_pays_itemized",
    validFrom: "2026-01-01",
    validTo: "2026-12-31",
  },
];

// `createdBy`/`approvedBy` seguem o padrão maker-checker de `payout_batches` (Fase 5, Passo 2 —
// packages/db/src/schema/payout-batch.ts): quem cria o lote (faixa `(staff)/repasses`, Passo 4b)
// nunca é quem aprova. `approvalRequestId` fica `null` nos 4 registros de amostra — nenhum está
// acima do limiar de dupla aprovação (R$ 5.000, docs/decisoes-de-negocio.md pergunta 5).
export const SAMPLE_PAYOUT_BATCHES: readonly PayoutBatchRow[] = [
  {
    id: "c0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS_ID,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    grossAmountCents: 720000,
    commissionAmountCents: 180000,
    expensesAmountCents: 0,
    netAmountCents: 540000,
    currency: "BRL",
    status: "sent",
    createdBy: "user_carla.operacoes",
    approvedBy: "user_marcos.financeiro",
    approvalRequestId: null,
  },
  {
    id: "c0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS_ID,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    grossAmountCents: 690000,
    commissionAmountCents: 172500,
    expensesAmountCents: 0,
    netAmountCents: 517500,
    currency: "BRL",
    status: "draft",
    createdBy: "user_carla.operacoes",
    approvedBy: null,
    approvalRequestId: null,
  },
  {
    id: "c0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT_ID,
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    grossAmountCents: 950000,
    commissionAmountCents: 190000,
    expensesAmountCents: 45000,
    netAmountCents: 715000,
    currency: "BRL",
    status: "sent",
    createdBy: "user_carla.operacoes",
    approvedBy: "user_marcos.financeiro",
    approvalRequestId: null,
  },
  {
    id: "c0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT_ID,
    periodStart: "2026-07-01",
    periodEnd: "2026-07-31",
    grossAmountCents: 880000,
    commissionAmountCents: 176000,
    expensesAmountCents: 38000,
    netAmountCents: 666000,
    currency: "BRL",
    status: "pending_approval",
    createdBy: "user_carla.operacoes",
    approvedBy: null,
    approvalRequestId: null,
  },
];
