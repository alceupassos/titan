// Job BullMQ de sincronização de canal (Fase 3, Passo 4c) — roda fora do enfileiramento
// (`../channel-queue.ts`), mesmo espírito de separação de `jobs/process-webhook.ts` (Fase 2).
// Fluxo, na ordem:
//   a. resolve o `TenantContext` a partir do `tenantId` já presente no payload — ao contrário do
//      webhook de pagamento (que não sabe o tenant até consultar `payment_intents` pela conexão
//      admin), aqui quem enfileira já sabe o tenant (é o próprio cockpit/Server Action mudando
//      disponibilidade/tarifa de uma unidade conhecida), então não precisa de `../admin-db.ts`;
//   b. resolve o adapter do canal (`../channel-adapter-port.ts` — ver o comentário longo naquele
//      arquivo sobre `@titan/channels` ainda não ter `src/` real nesta sessão);
//   c. busca o estado atual simplificado (disponibilidade OU tarifa, conforme `kind`) via
//      `ChannelSyncRepo` (`../channel-sync-repo.ts`) — NUNCA o delta que motivou o enfileiramento
//      (esse nem chega no payload, de propósito, ver `../channel-queue.ts`);
//   d. chama `adapter.pushAvailability`/`adapter.pushRates`;
//   e. grava o resultado em `channel_sync_log` (`status: "ok"|"error"`, `direction: "push"`) —
//      TODA tentativa grava uma linha, sucesso ou falha (histórico completo para o painel de
//      saúde da distribuição); em caso de erro, RELANÇA o erro para o BullMQ decidir retry/backoff
//      (configurados em `../channel-queue.ts`) — este job nunca decide sozinho se deve tentar de
//      novo, só registra o que aconteceu.
import type { Channel } from "@titan/domain";
import type { TenantContext } from "@titan/db";
import type { ChannelAdapter } from "@titan/channels";
import { ChannelAdapterNotConfiguredError } from "../channel-adapter-port";
import { civilDateFromEpochMs } from "../channel-sync-dates";
import type { ChannelSyncRepo } from "../channel-sync-repo";
import type { ChannelSyncJobPayload } from "../channel-queue";

export interface ProcessChannelSyncDeps {
  resolveAdapter(channel: Channel): ChannelAdapter;
  repo: ChannelSyncRepo;
  /** epoch ms — injetado, nunca `Date.now()` direto (mesmo padrão de `jobs/process-webhook.ts`). */
  now(): number;
  /** Quantos dias à frente considerar no cálculo simplificado do estado atual — default 60,
   * mesmo horizonte usado pela reconciliação diária (`jobs/reconcile-channels.ts`). */
  horizonDays?: number;
  logger?: Pick<Console, "log" | "error" | "warn">;
}

const DEFAULT_HORIZON_DAYS = 60;

export async function processChannelSyncJob(payload: ChannelSyncJobPayload, deps: ProcessChannelSyncDeps): Promise<void> {
  const log = deps.logger ?? console;
  const ctx: TenantContext = { tenantId: payload.tenantId, actorId: `channel-sync:${payload.channel}` };
  const horizonDays = deps.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const rangeStart = civilDateFromEpochMs(deps.now());

  let adapter: ChannelAdapter;
  try {
    adapter = deps.resolveAdapter(payload.channel);
  } catch (err) {
    const message = err instanceof ChannelAdapterNotConfiguredError ? err.message : (err as Error).message;
    await deps.repo.insertChannelSyncLog(ctx, {
      channel: payload.channel,
      unitId: payload.unitId,
      direction: "push",
      status: "error",
      detail: { reason: "adapter_not_configured", kind: payload.kind, error: message },
    });
    log.error(`[worker] channel-sync (unidade ${payload.unitId}, canal ${payload.channel}): ${message}`);
    throw err; // BullMQ decide retry/backoff/DLQ (../channel-queue.ts) — job nunca engole o erro.
  }

  try {
    if (payload.kind === "availability") {
      const snapshot = await deps.repo.buildAvailabilitySnapshot(ctx, payload.unitId, rangeStart, horizonDays);
      await adapter.pushAvailability(
        payload.unitId,
        snapshot.map((s) => ({ unitId: s.unitId, date: s.date, blocked: s.blocked })),
      );
    } else {
      const snapshot = await deps.repo.buildRateSnapshot(ctx, payload.unitId, rangeStart, horizonDays);
      await adapter.pushRates(
        payload.unitId,
        snapshot.map((s) => ({ unitId: s.unitId, date: s.date, priceAmount: s.priceAmount })),
      );
    }

    await deps.repo.insertChannelSyncLog(ctx, {
      channel: payload.channel,
      unitId: payload.unitId,
      direction: "push",
      status: "ok",
      detail: { kind: payload.kind },
    });
    log.log(`[worker] channel-sync ${payload.kind} unidade ${payload.unitId} canal ${payload.channel}: ok.`);
  } catch (err) {
    await deps.repo.insertChannelSyncLog(ctx, {
      channel: payload.channel,
      unitId: payload.unitId,
      direction: "push",
      status: "error",
      detail: { kind: payload.kind, error: (err as Error).message },
    });
    log.error(
      `[worker] channel-sync ${payload.kind} unidade ${payload.unitId} canal ${payload.channel} falhou: ${(err as Error).message}`,
    );
    throw err; // idem: BullMQ decide retry/backoff/DLQ, nunca este job.
  }
}
