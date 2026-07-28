// Dados de amostra para o cockpit fiscal (Fase 4, Passo 4c — docs/fase-atual.md). NÃO há Postgres
// vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2" de docs/fase-atual.md), então esta
// rota não consulta `packages/db` para LER. Mesmo espírito de
// apps/console/app/(staff)/distribuicao/sample-data.ts: o tipo aqui é o MESMO tipo de linha crua
// do Drizzle (`typeof fiscalDocuments.$inferSelect`), não uma interface solta reinventada — trocar
// por uma query real (`withTenant(...).select().from(fiscalDocuments)...`) é só trocar a fonte dos
// dados, nunca o formato consumido pela página/pelo client component.
//
// O CAMINHO DE ESCRITA (`retryInvoiceIssuanceAction`, `cancelInvoiceAction` — ./actions.ts) é
// real, contra o banco via `withTenant` — chamar qualquer uma a partir desta amostra tenta o
// Postgres de verdade e, sem Docker rodando, falha com erro de conexão (mesmo comportamento hoje
// de apps/console/app/(staff)/distribuicao). Os ids abaixo são UUIDs v4 válidos por isso mesmo.
//
// Determinístico de propósito (sem `Date.now()`) — mesma âncora de tempo usada em
// apps/console/app/(staff)/distribuicao/sample-data.ts, para o preview renderizar sempre igual.
import type { fiscalDocuments } from "@titan/db";

const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra das outras rotas.

const RESERVATION_STUDIO = "b0000000-0000-4000-8000-000000000001";
const RESERVATION_JARDINS = "b0000000-0000-4000-8000-000000000002";
const RESERVATION_LOFT = "b0000000-0000-4000-8000-000000000003";
const RESERVATION_CASA = "b0000000-0000-4000-8000-000000000004";

const NOW_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T14:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

type FiscalDocumentRow = typeof fiscalDocuments.$inferSelect;

// Município IBGE 3550308 = São Paulo — o único com `tax_rule` cadastrada nesta fase
// (packages/domain/src/fiscal/tax-rule.ts). `serviceCode` "9.01" = LC 116/2003, hospedagem.
export const SAMPLE_FISCAL_DOCUMENTS: readonly FiscalDocumentRow[] = [
  {
    id: "f0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    reservationId: RESERVATION_STUDIO,
    naturalKey: "nfse:3550308:r-b0000000-0000-4000-8000-000000000001:v1",
    municipalityCode: "3550308",
    serviceCode: "9.01",
    baseAmountCents: 120000,
    taxAmountCents: 6000,
    currency: "BRL",
    status: "pending",
    externalInvoiceId: null,
    xmlStorageRef: null,
    pdfStorageRef: null,
    rejectionReason: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 2 * DAY_MS),
    issuedAt: null,
  },
  {
    id: "f0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    reservationId: RESERVATION_JARDINS,
    naturalKey: "nfse:3550308:r-b0000000-0000-4000-8000-000000000002:v1",
    municipalityCode: "3550308",
    serviceCode: "9.01",
    baseAmountCents: 89000,
    taxAmountCents: 4450,
    currency: "BRL",
    status: "rejected",
    externalInvoiceId: null,
    xmlStorageRef: null,
    pdfStorageRef: null,
    rejectionReason: "CNPJ do tomador com dígito verificador inválido — provedor recusou o lote (Focus NFe, erro 422).",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * DAY_MS),
    issuedAt: null,
  },
  {
    id: "f0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    reservationId: RESERVATION_LOFT,
    naturalKey: "nfse:3550308:r-b0000000-0000-4000-8000-000000000003:v1",
    municipalityCode: "3550308",
    serviceCode: "9.01",
    baseAmountCents: 215000,
    taxAmountCents: 10750,
    currency: "BRL",
    status: "issued",
    externalInvoiceId: "focus-nfe-2026-000841",
    xmlStorageRef: "worm://fiscal/2026/07/f0000000-0000-4000-8000-000000000003.xml",
    pdfStorageRef: "worm://fiscal/2026/07/f0000000-0000-4000-8000-000000000003.pdf",
    rejectionReason: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 10 * DAY_MS),
    issuedAt: new Date(NOW_ANCHOR_EPOCH_MS - 10 * DAY_MS + 30 * 60 * 1000),
  },
  {
    id: "f0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    reservationId: RESERVATION_CASA,
    naturalKey: "nfse:3550308:r-b0000000-0000-4000-8000-000000000004:v1",
    municipalityCode: "3550308",
    serviceCode: "9.01",
    baseAmountCents: 340000,
    taxAmountCents: 17000,
    currency: "BRL",
    status: "issued",
    externalInvoiceId: "focus-nfe-2026-000842",
    xmlStorageRef: "worm://fiscal/2026/07/f0000000-0000-4000-8000-000000000004.xml",
    pdfStorageRef: "worm://fiscal/2026/07/f0000000-0000-4000-8000-000000000004.pdf",
    rejectionReason: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 18 * DAY_MS),
    issuedAt: new Date(NOW_ANCHOR_EPOCH_MS - 18 * DAY_MS + 45 * 60 * 1000),
  },
];
