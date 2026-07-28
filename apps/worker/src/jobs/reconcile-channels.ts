// Job de reconciliação diária (Fase 3, Passo 4c). Para cada `(unidade, canal)` mapeado em
// `listing_mappings` — TODOS os tenants, descoberto via a conexão admin (`../admin-db.ts`,
// `listAllListingMappings`) — chama `adapter.reconcile(unitId, rangeStart, rangeEnd)` e persiste
// cada `Divergence` encontrada em `divergences` (`status: "open"`), já sob `withTenant()` do
// tenant dono daquele mapeamento (`../channel-sync-repo.ts`, `insertDivergences`).
//
// Suposição sobre o shape de `adapter.reconcile` documentada em `../channel-adapter-port.ts`
// (retorna `readonly Divergence[]` diretamente) — se o `packages/channels/src/port.ts` real, ao
// ser publicado por outra faixa, devolver outra coisa (ex.: os dois snapshots crus em vez da
// comparação já feita), só a chamada dentro do loop abaixo precisa mudar.
//
// Um erro isolado num par (unidade, canal) é capturado e logado — NUNCA interrompe a rodada
// inteira; os demais mapeamentos continuam sendo reconciliados. Canal sem adapter configurado
// (hoje, todo canal — ver `../channel-adapter-port.ts`) é pulado com aviso, não é tratado como
// erro (é esperado nesta sessão, documentado, não uma falha de infraestrutura real).
import type { TenantContext } from "@titan/db";
import type { Channel, Divergence } from "@titan/domain";
import type { ChannelAdapter } from "@titan/channels";
import { civilDateFromEpochMs, addDaysToCivilDate } from "../channel-sync-dates";

export interface ReconcileChannelsListingMapping {
  readonly tenantId: string;
  readonly unitId: string;
  readonly channel: Channel;
}

export interface ReconcileChannelsDeps {
  listAllListingMappings(): Promise<readonly ReconcileChannelsListingMapping[]>;
  resolveAdapter(channel: Channel): ChannelAdapter;
  insertDivergences(ctx: TenantContext, divs: readonly Divergence[]): Promise<void>;
  /** epoch ms — injetado, nunca `Date.now()` direto. */
  now(): number;
  /** Janela de reconciliação a partir de hoje, em dias — default 60 (mesmo horizonte do Passo 4c,
   * item 3 da tarefa: "~60 dias a partir de hoje"). */
  horizonDays?: number;
  logger?: Pick<Console, "log" | "error" | "warn">;
}

const DEFAULT_HORIZON_DAYS = 60;

export async function reconcileChannelsJob(deps: ReconcileChannelsDeps): Promise<void> {
  const log = deps.logger ?? console;
  const horizonDays = deps.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const rangeStart = civilDateFromEpochMs(deps.now());
  const rangeEnd = addDaysToCivilDate(rangeStart, horizonDays);

  const mappings = await deps.listAllListingMappings();
  log.log(`[worker] reconciliação diária: ${mappings.length} mapeamento(s) unidade<->canal a verificar.`);

  for (const mapping of mappings) {
    let adapter: ChannelAdapter;
    try {
      adapter = deps.resolveAdapter(mapping.channel);
    } catch (err) {
      log.warn(
        `[worker] reconciliação: adapter para canal "${mapping.channel}" não configurado — unidade ` +
          `${mapping.unitId} (tenant ${mapping.tenantId}) pulada nesta rodada. ${(err as Error).message}`,
      );
      continue;
    }

    try {
      const divergencesFound = await adapter.reconcile(mapping.unitId, rangeStart, rangeEnd);
      if (divergencesFound.length > 0) {
        const ctx: TenantContext = { tenantId: mapping.tenantId, actorId: `reconciliation:${mapping.channel}` };
        await deps.insertDivergences(ctx, divergencesFound);
      }
      log.log(
        `[worker] reconciliação unidade ${mapping.unitId} canal ${mapping.channel}: ` +
          `${divergencesFound.length} divergência(s) encontrada(s).`,
      );
    } catch (err) {
      log.error(
        `[worker] reconciliação unidade ${mapping.unitId} canal ${mapping.channel} falhou: ${(err as Error).message}`,
      );
      // Não relança: um par (unidade, canal) com falha (rede, canal fora do ar) não deveria
      // impedir a reconciliação de todos os outros pares desta rodada.
    }
  }
}
