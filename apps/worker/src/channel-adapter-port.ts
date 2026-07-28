// Resolução de adapter de canal por registro (Fase 3, Passo 4c/5 — docs/fase-atual.md). A
// interface `ChannelAdapter` real agora vem de `@titan/channels` (o pacote terminou de ser
// escrito por outras duas faixas em paralelo — `packages/channels/src/port.ts` +
// `src/ical/adapter.ts` + `src/browser-automation/airbnb-adapter.ts`); este arquivo deixou de
// espelhar o shape localmente (migração feita no Passo 5 de integração final).
//
// `resolveChannelAdapter` continua análoga a `resolveGatewayAdapter` (apps/web/lib/payment-gateway.ts,
// Fase 2): resolve o adapter configurado para um canal a partir de um registro injetável. Um
// `registry` vazio (o default) faz TODO canal lançar `ChannelAdapterNotConfiguredError` — mesmo
// espírito de `GatewayNotConfiguredError`. `index.ts` (bootstrap) popula o registry real com
// `IcalChannelAdapter` (booking/vrbo/expedia/airbnb — disponibilidade via feed) e
// `AirbnbBrowserAutomationAdapter` (airbnb — tarifa/reserva estruturada, ver ADR-0020).
import type { Channel } from "@titan/domain";
import type { ChannelAdapter } from "@titan/channels";

export class ChannelAdapterNotConfiguredError extends Error {
  constructor(channel: Channel) {
    super(
      `Adapter para o canal "${channel}" não configurado nesta sessão — ver apps/worker/src/index.ts ` +
        "(bootstrap) para como o registro de adapters é montado.",
    );
    this.name = "ChannelAdapterNotConfiguredError";
  }
}

export function resolveChannelAdapter(
  channel: Channel,
  registry: ReadonlyMap<Channel, ChannelAdapter> = new Map(),
): ChannelAdapter {
  const adapter = registry.get(channel);
  if (!adapter) {
    throw new ChannelAdapterNotConfiguredError(channel);
  }
  return adapter;
}
