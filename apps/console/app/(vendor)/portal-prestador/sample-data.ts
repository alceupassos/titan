// Dados de amostra do Portal do Prestador (Fase 7, Passo 4a — docs/fase-atual.md). NÃO há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2"), então estas rotas
// Server Component não consultam `packages/db` para LER ainda — mesmo padrão de
// apps/console/app/(owner)/portal/sample-data.ts e .../limpeza/servicos/sample-data.ts. Os tipos
// aqui são os MESMOS tipos de linha crua do Drizzle (`typeof workOrders.$inferSelect`,
// `typeof accountsPayable.$inferSelect`) — trocar por uma query real (`./queries.ts`, já escrita e
// real, só não exercitada nesta sessão) é só trocar a fonte dos dados, nunca o formato consumido
// pelas páginas.
//
// Tenant/unidades/prestador reaproveitam os MESMOS uuids já usados em
// apps/console/app/(staff)/limpeza/servicos/sample-data.ts (mesmo mundo de amostra do resto do
// cockpit) — literais repetidos aqui de propósito, não um import cruzado entre route groups de
// faixas paralelas distintas (ver comentário de ./status.ts sobre não acoplar diretórios de
// faixas concorrentes).
//
// Determinístico de propósito (sem `Date.now()`) — mesma âncora de tempo ("2026-07-28T14:00:00Z")
// já usada nas outras rotas de amostra do cockpit, para o preview renderizar sempre igual.
import type { accountsPayable, workOrders } from "@titan/db";
import type { VendorRetentionAmounts } from "@titan/domain";

export const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra das outras rotas.

// "Manutenção Predial Sul" — mesmo uuid de VENDOR_MANUTENCAO em
// apps/console/app/(staff)/limpeza/servicos/sample-data.ts, para o preview do prestador logado
// ser coerente com as OS já atribuídas a ele em outras telas do cockpit.
export const VENDOR_ID = "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b02";

const UNIT_STUDIO = "a0000000-0000-4000-8000-000000000001"; // Studio Vista Mar 101
const UNIT_JARDINS = "a0000000-0000-4000-8000-000000000002"; // Apartamento Jardins 202
const UNIT_LOFT = "a0000000-0000-4000-8000-000000000003"; // Loft Centro 401
const UNIT_CASA = "a0000000-0000-4000-8000-000000000004"; // Casa de Praia Enseada

export const UNIT_LABEL: Record<string, string> = {
  [UNIT_STUDIO]: "Studio Vista Mar 101",
  [UNIT_JARDINS]: "Apartamento Jardins 202",
  [UNIT_LOFT]: "Loft Centro 401",
  [UNIT_CASA]: "Casa de Praia Enseada",
};

const NOW_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T14:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

type WorkOrderRow = typeof workOrders.$inferSelect;
type AccountsPayableRow = typeof accountsPayable.$inferSelect;

/** OS atribuídas a `VENDOR_ID`, cobrindo os 4 estados relevantes ao prestador
 * (dispatched/accepted_vendor/executing/rework) mais um par já concluído (billed/paid), para o
 * quadro "Minhas OS" mostrar tanto pendências de ação quanto histórico. */
export const SAMPLE_VENDOR_WORK_ORDERS: readonly WorkOrderRow[] = [
  {
    id: "w0000000-0000-4000-8000-000000000101",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    serviceType: "dedetizacao",
    vendorId: VENDOR_ID,
    status: "dispatched",
    description: "Dedetização trimestral programada — seção 9.8.4.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 3 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 1 * DAY_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000102",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    serviceType: "ar_condicionado",
    vendorId: VENDOR_ID,
    status: "accepted_vendor",
    description: "Ar-condicionado não gela — hóspede reportou no check-in.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 2 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 6 * HOUR_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000103",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    serviceType: "manutencao_corretiva",
    vendorId: VENDOR_ID,
    status: "executing",
    description: "Substituição de chuveiro elétrico com defeito.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 4 * HOUR_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000104",
    tenantId: TENANT_ID,
    unitId: UNIT_CASA,
    serviceType: "piscina",
    vendorId: VENDOR_ID,
    status: "rework",
    description: "Tratamento químico reprovado na vistoria — água ainda turva.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 6 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 12 * HOUR_MS),
  },
  {
    id: "w0000000-0000-4000-8000-000000000105",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    serviceType: "estofado",
    vendorId: VENDOR_ID,
    status: "paid",
    description: "Higienização de estofado do sofá — pós check-out com mancha.",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 15 * DAY_MS),
    updatedAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * DAY_MS),
  },
];

/**
 * `accounts_payable` já pagos ao prestador, com `retentionBreakdown` de amostra cobrindo os 3
 * regimes de tributação (`VendorTaxRegime`, packages/domain/src/vendor/retention.ts) — números
 * ilustrativos, não uma tabela de alíquota real (a regra dura "retenção: tabela versionada, nunca
 * código" aplica-se a `vendor_retention_rules`, não a esta amostra estática de UI). Em cada linha,
 * `netCents + inssCents + irrfCents + csrfCents + issCents === amountCents` por construção — mesma
 * garantia de `calculateVendorRetentionAmountsCents`.
 */
export const SAMPLE_VENDOR_PAYMENTS: readonly AccountsPayableRow[] = [
  {
    id: "p0000000-0000-4000-8000-000000000201",
    tenantId: TENANT_ID,
    vendorId: VENDOR_ID,
    unitId: UNIT_STUDIO,
    description: "Higienização de estofado — OS w...105 (regime: PJ com cessão de mão de obra)",
    amountCents: 300000, // R$ 3.000,00 bruto
    currency: "BRL",
    status: "paid",
    dueDate: "2026-07-10",
    approvalRequestId: null,
    retentionBreakdown: {
      inssCents: 33000,
      irrfCents: 4500,
      csrfCents: 13950,
      issCents: 15000,
      netCents: 233550,
    } satisfies VendorRetentionAmounts,
  },
  {
    id: "p0000000-0000-4000-8000-000000000202",
    tenantId: TENANT_ID,
    vendorId: VENDOR_ID,
    unitId: UNIT_LOFT,
    description: "Manutenção corretiva (chuveiro elétrico) — regime: PJ optante pelo Simples",
    amountCents: 180000, // R$ 1.800,00 bruto
    currency: "BRL",
    status: "paid",
    dueDate: "2026-06-25",
    approvalRequestId: null,
    retentionBreakdown: {
      inssCents: 0,
      irrfCents: 0,
      csrfCents: 0,
      issCents: 9000,
      netCents: 171000,
    } satisfies VendorRetentionAmounts,
  },
  {
    id: "p0000000-0000-4000-8000-000000000203",
    tenantId: TENANT_ID,
    vendorId: VENDOR_ID,
    unitId: UNIT_CASA,
    description: "Manutenção de jardinagem avulsa — regime: PF autônomo",
    amountCents: 150000, // R$ 1.500,00 bruto
    currency: "BRL",
    status: "paid",
    dueDate: "2026-06-05",
    approvalRequestId: null,
    retentionBreakdown: {
      inssCents: 16500,
      irrfCents: 11250,
      csrfCents: 0,
      issCents: 0,
      netCents: 122250,
    } satisfies VendorRetentionAmounts,
  },
];
