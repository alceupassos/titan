// Dados de amostra para o cockpit de distribuição (Fase 3, Passo 4d — docs/fase-atual.md). NÃO há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2"), então esta rota não
// consulta `packages/db` para LER. Mesmo espírito de apps/console/app/(staff)/aprovacoes/
// sample-data.ts: os tipos aqui são os MESMOS tipos de linha crua do Drizzle
// (`typeof divergences.$inferSelect`, `typeof channelSyncLog.$inferSelect`,
// `typeof listingMappings.$inferSelect`) — não uma interface solta reinventada — para que trocar
// por uma query real (`withTenant(...).select().from(divergences)...`) seja só trocar a fonte dos
// dados, nunca o formato consumido pela página/pelos client components.
//
// O CAMINHO DE ESCRITA (`resolveDivergenceAction`, `retrySyncAction`, `toggleChannelAdapterAction`
// — ./actions.ts) é real, contra o banco via `withTenant` — chamar qualquer uma a partir desta
// amostra tenta o Postgres de verdade e, sem Docker rodando, falha com erro de conexão (mesmo
// comportamento hoje de apps/console/app/(staff)/reservas/nova). Os ids abaixo são UUIDs v4
// válidos por isso mesmo.
//
// Determinístico de propósito (sem `Date.now()`) — mesma âncora de tempo usada em
// apps/console/app/(staff)/aprovacoes/sample-data.ts, para o preview renderizar sempre igual.
import type { channelSyncLog, divergences, listingMappings } from "@titan/db";

const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra da fila de aprovações.

const UNIT_STUDIO = "a0000000-0000-4000-8000-000000000001"; // Studio Vista Mar 101
const UNIT_JARDINS = "a0000000-0000-4000-8000-000000000002"; // Apartamento Jardins 202
const UNIT_LOFT = "a0000000-0000-4000-8000-000000000003"; // Loft Centro 401
const UNIT_CASA = "a0000000-0000-4000-8000-000000000004"; // Casa de Praia Enseada

const NOW_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T14:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

type ListingMappingRow = typeof listingMappings.$inferSelect;
type DivergenceRow = typeof divergences.$inferSelect;
type ChannelSyncLogRow = typeof channelSyncLog.$inferSelect;

// Só 3 dos 4 canais externos têm mapeamento ativo — Expedia ainda não foi certificado/conectado
// nesta amostra (o "direct" não entra aqui: reserva direta não passa por listing_mappings, é
// origem interna, não um canal externo a "conectar").
export const SAMPLE_LISTING_MAPPINGS: readonly ListingMappingRow[] = [
  {
    id: "c0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    channel: "airbnb",
    externalListingId: "airbnb-listing-88213",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 60 * 24 * HOUR_MS),
  },
  {
    id: "c0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    channel: "booking",
    externalListingId: "booking-listing-40217",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 45 * 24 * HOUR_MS),
  },
  {
    id: "c0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    channel: "vrbo",
    externalListingId: "vrbo-listing-11029",
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 30 * 24 * HOUR_MS),
  },
];

export const SAMPLE_DIVERGENCES: readonly DivergenceRow[] = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    channel: "airbnb",
    unitId: UNIT_STUDIO,
    kind: "availability_mismatch",
    date: "2026-08-12",
    detail: { localStatus: "blocked", remoteStatus: "available", source: "reconciliation-job" },
    status: "open",
    detectedAt: new Date(NOW_ANCHOR_EPOCH_MS - 3 * HOUR_MS),
    resolvedAt: null,
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    channel: "booking",
    unitId: UNIT_JARDINS,
    kind: "rate_mismatch",
    date: "2026-08-20",
    detail: { localPriceCents: 40000, remotePriceCents: 38000, ratePlanId: "b0000000-0000-4000-8000-000000000002" },
    status: "open",
    detectedAt: new Date(NOW_ANCHOR_EPOCH_MS - 9 * HOUR_MS),
    resolvedAt: null,
  },
  {
    id: "d0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    channel: "vrbo",
    unitId: UNIT_LOFT,
    kind: "unmapped_reservation",
    date: null,
    detail: { externalReservationId: "vrbo-res-77410", note: "Reserva chegou do canal sem listing_mapping correspondente ativo" },
    status: "open",
    detectedAt: new Date(NOW_ANCHOR_EPOCH_MS - 20 * HOUR_MS),
    resolvedAt: null,
  },
  {
    id: "d0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    channel: "airbnb",
    unitId: UNIT_CASA,
    kind: "availability_mismatch",
    date: "2026-08-05",
    detail: { localStatus: "available", remoteStatus: "available", source: "reconciliation-job" },
    status: "resolved",
    detectedAt: new Date(NOW_ANCHOR_EPOCH_MS - 30 * HOUR_MS),
    resolvedAt: new Date(NOW_ANCHOR_EPOCH_MS - 28 * HOUR_MS),
  },
];

export const SAMPLE_CHANNEL_SYNC_LOG: readonly ChannelSyncLogRow[] = [
  {
    id: "e0000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    channel: "airbnb",
    unitId: UNIT_STUDIO,
    direction: "push",
    status: "error",
    detail: { httpStatus: 502, message: "Timeout no painel de host (browser-automation) — ver ADR-0020" },
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 2 * HOUR_MS),
  },
  {
    id: "e0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    channel: "booking",
    unitId: UNIT_JARDINS,
    direction: "pull",
    status: "error",
    detail: { httpStatus: 429, message: "Rate limit do agregador — reprocessar após backoff" },
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * HOUR_MS),
  },
  {
    id: "e0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    channel: "vrbo",
    unitId: UNIT_LOFT,
    direction: "pull",
    status: "ok",
    detail: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 1 * HOUR_MS),
  },
  {
    id: "e0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    channel: "airbnb",
    unitId: UNIT_CASA,
    direction: "push",
    status: "ok",
    detail: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 30 * 60 * 1000),
  },
];

// Todos os 5 valores possíveis de canal (packages/contracts/src/distribution.ts, ChannelSchema) —
// usado pelo painel de kill switch, que precisa listar TODO canal conhecido, conectado ou não.
export const ALL_CHANNELS = ["direct", "airbnb", "booking", "vrbo", "expedia"] as const;
