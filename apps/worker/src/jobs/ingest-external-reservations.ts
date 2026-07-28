// Ingestão de reserva externa (Fase 3, Passo 5 — integração final, docs/fase-atual.md). Para
// cada canal com `capabilities.pullReservations === true` (hoje só o adapter de automação de
// navegador do Airbnb — iCal não tem reserva estruturada, ver
// packages/channels/src/ical/adapter.ts), busca reservas novas via `adapter.pullReservations`,
// resolve o `ListingMapping` (varredura cross-tenant via conexão admin — mesmo raciocínio de
// `jobs/reconcile-channels.ts`: não sabemos o tenant antes de olhar o mapeamento), traduz para o
// shape de domínio via `mapExternalReservationToDomain` (I1 — MESMA checagem/constraint EXCLUDE
// da reserva direta, nunca um caminho separado por canal — docs/anti-padroes.md #5) e insere como
// reserva `pending`, provisionando a comissão de canal no ledger (`entriesForChannelCommission`).
//
// Reserva sem mapeamento encontrado NUNCA é descartada em silêncio: vira uma `Divergence` de
// `kind: "unmapped_reservation"` persistida em `divergences` (seção 9.2 do prompt único: "reservas
// não mapeadas" no painel de saúde da distribuição) — precisa de correção assistida no cockpit
// (mapear o listing manualmente), não uma reserva perdida.
//
// DÍVIDA TÉCNICA documentada (não escondida): não há, nesta fase, nenhuma fonte real de percentual
// de comissão por canal (isso é `settlement_batch`/conciliação de repasse, Fase 5 — seção 9.5 do
// prompt único). Em vez de inventar uma taxa, a comissão é provisionada como ZERO nesta fase — o
// valor bruto inteiro vira recebível do canal. Corrigir quando a Fase 5 tiver o dado real, nunca
// "chutar" um percentual agora.
import type { Cents, Channel, LedgerEntry } from "@titan/domain";
import { entriesForChannelCommission, mapExternalReservationToDomain, postDoubleEntry, UnmappedListingError } from "@titan/domain";
import type { TenantContext } from "@titan/db";
import type { ChannelAdapter, Page } from "@titan/channels";
import type { ExternalReservation, Divergence } from "@titan/domain";

const ACCOUNT_UNIT_REVENUE = { code: "unit_revenue", name: "Receita de hospedagem", kind: "revenue" as const };
const ACCOUNT_CHANNEL_RECEIVABLE = { code: "channel_receivable", name: "A receber de canal (OTA)", kind: "asset" as const };
const ACCOUNT_CHANNEL_COMMISSION = { code: "channel_commission_expense", name: "Comissão de canal (OTA)", kind: "expense" as const };

const COMMISSION_RATE_CENTS_PER_CENT = 0; // ver nota de dívida técnica acima — nunca inventado.

export interface IngestListingMapping {
  readonly tenantId: string;
  readonly unitId: string;
  readonly channel: Channel;
  readonly externalListingId: string;
}

export interface IngestExternalReservationsDeps {
  listAllListingMappings(): Promise<readonly IngestListingMapping[]>;
  resolveAdapter(channel: Channel): ChannelAdapter;
  insertExternalReservation(
    ctx: TenantContext,
    input: { unitId: string; stayLiteral: string; channel: string; externalRef: string; priceCents: Cents; currency: string },
  ): Promise<{ kind: "created"; reservationId: string } | { kind: "exclusion_violation" }>;
  /** Mesmo contrato de `PaymentRepo.findOrCreateAccount` (payment-repo.ts, Fase 2) — reusado, não
   * duplicado. */
  findOrCreateAccount(ctx: TenantContext, code: string, name: string, kind: "asset" | "liability" | "equity" | "revenue" | "expense"): Promise<string>;
  /** Mesmo contrato de `PaymentRepo.insertLedgerEntries`. */
  insertLedgerEntries(ctx: TenantContext, entries: readonly LedgerEntry[]): Promise<void>;
  /** Mesmo contrato de `ChannelSyncRepo.insertDivergences` (channel-sync-repo.ts, Fase 3). */
  insertDivergences(ctx: TenantContext, divs: readonly Divergence[]): Promise<void>;
  idGenerator(): string;
  now(): number;
  logger?: Pick<Console, "log" | "error" | "warn">;
}

const CHANNELS_WITH_STRUCTURED_RESERVATIONS: readonly Channel[] = ["airbnb", "booking", "vrbo", "expedia"];

function daterangeLiteral(checkinISO: string, checkoutISO: string): string {
  return `[${checkinISO},${checkoutISO})`;
}

export async function ingestExternalReservationsJob(deps: IngestExternalReservationsDeps): Promise<void> {
  const log = deps.logger ?? console;
  const mappings = await deps.listAllListingMappings();

  for (const channel of CHANNELS_WITH_STRUCTURED_RESERVATIONS) {
    let adapter: ChannelAdapter;
    try {
      adapter = deps.resolveAdapter(channel);
    } catch (err) {
      log.warn(`[worker] ingestão de reservas: adapter para canal "${channel}" não configurado — pulado. ${(err as Error).message}`);
      continue;
    }

    if (!adapter.capabilities.pullReservations) {
      continue; // capability é dado, não branch condicional por canal (docs/anti-padroes.md #5).
    }

    let page: Page<ExternalReservation>;
    try {
      page = await adapter.pullReservations(deps.now() - 24 * 60 * 60 * 1000); // últimas 24h
    } catch (err) {
      log.error(`[worker] ingestão de reservas do canal "${channel}" falhou: ${(err as Error).message}`);
      continue; // um canal falhar não impede os demais nesta rodada.
    }

    for (const external of page.items) {
      const mapping = mappings.find((m) => m.channel === channel && m.externalListingId === external.externalListingId);

      if (!mapping) {
        // Sem mapeamento -> sem tenant conhecido para persistir a divergência sob RLS. Registrado
        // só no log do processo nesta fase (dívida técnica: um "tenant órfão" de anúncio
        // desconhecido não tem onde morar sem um dono — corrigir quando `listing_mappings` tiver
        // um fluxo de auto-descoberta de anúncio não mapeado).
        log.warn(
          `[worker] reserva externa "${external.externalReservationId}" (canal ${channel}, anúncio ` +
            `${external.externalListingId}) sem ListingMapping — não é possível determinar o tenant/unidade.`,
        );
        continue;
      }

      const ctx: TenantContext = { tenantId: mapping.tenantId, actorId: `channel-ingest:${channel}` };

      let domainReservation: ReturnType<typeof mapExternalReservationToDomain>;
      try {
        // `mapExternalReservationToDomain` só lê `unitId`/`externalListingId` do mapping (ver
        // packages/domain/src/channel/external-reservation.ts) — `id`/`createdAtEpochMs` não
        // existem em `IngestListingMapping` (o resultado da varredura cross-tenant admin não
        // carrega essas colunas, ver `admin-db.ts`/`listAllListingMappings`) e não fazem
        // diferença para a checagem de sanidade feita dentro da função.
        domainReservation = mapExternalReservationToDomain(external, {
          id: "n/a",
          tenantId: mapping.tenantId,
          unitId: mapping.unitId,
          channel: mapping.channel,
          externalListingId: mapping.externalListingId,
          createdAtEpochMs: 0,
        });
      } catch (err) {
        if (err instanceof UnmappedListingError) {
          await deps.insertDivergences(ctx, [
            {
              unitId: mapping.unitId,
              channel,
              kind: "unmapped_reservation",
              detail: { externalReservationId: external.externalReservationId, reason: err.message },
              detectedAtEpochMs: deps.now(),
            },
          ]);
          continue;
        }
        throw err;
      }

      const outcome = await deps.insertExternalReservation(ctx, {
        unitId: domainReservation.unitId,
        stayLiteral: daterangeLiteral(domainReservation.stay.checkin, domainReservation.stay.checkout),
        channel: domainReservation.channel,
        externalRef: domainReservation.externalRef,
        priceCents: domainReservation.priceAmount.amountCents,
        currency: domainReservation.priceAmount.currency,
      });

      if (outcome.kind === "exclusion_violation") {
        // I1: a constraint EXCLUDE do banco recusou — a MESMA garantia de reserva direta, sem
        // caminho separado por canal. Registrado como divergência para correção assistida (a OTA
        // acha que vendeu, o banco discorda — precisa de atenção humana, não é engolido em silêncio).
        await deps.insertDivergences(ctx, [
          {
            unitId: mapping.unitId,
            channel,
            kind: "availability_mismatch",
            detail: {
              externalReservationId: external.externalReservationId,
              reason: "constraint EXCLUDE recusou — unidade já tem reserva ativa sobreposta (I1).",
            },
            detectedAtEpochMs: deps.now(),
          },
        ]);
        log.error(
          `[worker] reserva externa "${external.externalReservationId}" (unidade ${mapping.unitId}) violou I1 — divergência registrada.`,
        );
        continue;
      }

      // Comissão de canal (I2/9.2 — "collected by channel"): ver nota de dívida técnica no topo
      // do arquivo sobre por que a taxa é zero nesta fase, nunca inventada.
      const commissionAmountCents = Math.round(domainReservation.priceAmount.amountCents * COMMISSION_RATE_CENTS_PER_CENT);
      const unitRevenueAccountId = await deps.findOrCreateAccount(ctx, ACCOUNT_UNIT_REVENUE.code, ACCOUNT_UNIT_REVENUE.name, ACCOUNT_UNIT_REVENUE.kind);
      const channelReceivableAccountId = await deps.findOrCreateAccount(ctx, ACCOUNT_CHANNEL_RECEIVABLE.code, ACCOUNT_CHANNEL_RECEIVABLE.name, ACCOUNT_CHANNEL_RECEIVABLE.kind);
      const channelCommissionAccountId = await deps.findOrCreateAccount(ctx, ACCOUNT_CHANNEL_COMMISSION.code, ACCOUNT_CHANNEL_COMMISSION.name, ACCOUNT_CHANNEL_COMMISSION.kind);

      const lines = entriesForChannelCommission({
        reservationId: outcome.reservationId,
        unitRevenueAccountId,
        channelReceivableAccountId,
        channelCommissionExpenseAccountId: channelCommissionAccountId,
        grossAmountCents: domainReservation.priceAmount.amountCents,
        commissionAmountCents,
        currency: domainReservation.priceAmount.currency,
      });
      const entries = postDoubleEntry({ tenantId: ctx.tenantId, lines, createdAtEpochMs: deps.now(), idGenerator: deps.idGenerator });
      await deps.insertLedgerEntries(ctx, entries);

      log.log(
        `[worker] reserva externa "${external.externalReservationId}" ingerida como ${outcome.reservationId} ` +
          `(unidade ${mapping.unitId}, canal ${channel}) — comissão provisionada.`,
      );
    }
  }
}
