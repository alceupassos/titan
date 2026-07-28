// Porta comum de adapter de canal de distribuição (Fase 3, Passo 4a — docs/fase-atual.md).
// Ponto de partida: seção 9.2 do prompt único (`interface ChannelAdapter`), ajustado aos tipos
// reais de `@titan/domain` e a duas decisões de shape tomadas nesta faixa (documentadas abaixo).
// Mesmo espírito de `packages/payments/src/port.ts` na Fase 2: um contrato único, consumido de
// forma polimórfica pelo roteador de distribuição, para que o resto da aplicação nunca precise
// de `if canal === 'airbnb'` espalhado (docs/anti-padroes.md #5) — a diferença de capacidade
// entre canais é dado (`capabilities`), nunca ramificação de código.
//
// Por que `capabilities` existe: nem todo canal suporta tudo. Um canal via API direta certificada
// (Booking/Expedia/VRBO Connectivity APIs, Airbnb Partner API — nenhum ainda implementado nesta
// fase) tipicamente suporta tarifa, restrição, reserva estruturada e mensageria; um canal via
// **iCal** (`IcalChannelAdapter`, implementado nesta faixa) é estruturalmente mais pobre — feed
// somente-disponibilidade, sem tarifa, sem reserva estruturada, sem webhook, sem reserva
// instantânea (ver `docs/invariantes.md`/prompt.md 9.2: "iCal — disponibilidade unidirecional,
// latência de minutos a horas, sem tarifas nem reservas estruturadas"). O roteador de
// distribuição (faixa `apps/worker`, fora de escopo aqui) lê `capabilities` para decidir o que
// tentar, em vez de descobrir em runtime que uma chamada falha.
//
// Duas divergências deliberadas do sketch original do prompt.md (seção 9.2):
// 1. `pullReservations(since: Date, ...)` virou `pullReservations(sinceEpochMs: number, ...)` —
//    mesma convenção do resto do domínio (`detectAvailabilityDrift`/`ledger` etc.: epoch ms
//    injetado pelo chamador, nunca `Date` cru nem `Date.now()` dentro de código de borda
//    determinístico) — consistência com `docs/anti-padroes.md` #9 (o espírito da regra, ainda que
//    esta não seja "data de estadia").
// 2. `reconcile(unitId, range: DateRange)` virou `reconcile(unitId, rangeStart: CivilDate,
//    rangeEnd: CivilDate)` — evita inventar um tipo `DateRange` novo quando `CivilDate` (de
//    `@titan/dates`) já expressa "data civil, sem hora/fuso" com a mesma garantia de tipagem que
//    `Stay` usa para reserva.
//
// `handleWebhook(raw: unknown): Promise<unknown[]>` — o sketch original do prompt.md pedia
// `Promise<DomainEvent[]>`, mas não existe ainda um `DomainEvent` de canal modelado em
// `@titan/domain` (o `events/index.ts` do pacote domain cobre eventos de domínio central, não
// eventos de sincronização de canal). Documentado como dívida: quando o bounded context de
// eventos de distribuição for modelado, este retorno migra para o tipo real; por ora, `unknown[]`
// é honesto sobre o que ainda não existe, em vez de fingir um shape que ninguém consome.
import type { Channel } from "@titan/domain";
import type {
  CalendarDelta,
  RateDelta,
  ExternalReservation,
  Divergence,
} from "@titan/domain";
import type { CivilDate } from "@titan/dates";

export interface ChannelCapabilities {
  readonly pushRates: boolean;
  readonly pushRestrictions: boolean;
  readonly pullReservations: boolean;
  readonly pushContent: boolean;
  readonly instantBooking: boolean;
  readonly messaging: boolean;
}

export interface ListingSnapshot {
  readonly unitId: string;
  readonly name: string;
  // Mínimo necessário nesta fase — sem fotos/amenidades/descrição completa. O portão de saída
  // desta fase (docs/roadmap.md, F3) é disponibilidade/reconciliação, não conteúdo rico de
  // anúncio; expandir este shape é trabalho de uma fase futura de "conteúdo de canal", não desta.
}

export interface MappingResult {
  readonly externalListingId: string;
  readonly ok: boolean;
  readonly detail?: string;
}

export interface AckResult {
  readonly ok: boolean;
  readonly detail?: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export interface ChannelAdapter {
  readonly channel: Channel;
  readonly capabilities: ChannelCapabilities;
  syncContent(listing: ListingSnapshot): Promise<MappingResult>;
  pushAvailability(unitId: string, calendar: readonly CalendarDelta[]): Promise<AckResult>;
  pushRates(unitId: string, rates: readonly RateDelta[]): Promise<AckResult>;
  pullReservations(sinceEpochMs: number, cursor?: string): Promise<Page<ExternalReservation>>;
  handleWebhook(raw: unknown): Promise<unknown[]>;
  reconcile(unitId: string, rangeStart: CivilDate, rangeEnd: CivilDate): Promise<Divergence[]>;
}

/**
 * Lançado por um adapter quando uma operação do contrato comum não existe de fato no canal
 * concreto (ex.: `pushRates()`/`pullReservations()`/`reconcile()` em `IcalChannelAdapter`, que
 * não tem tarifa, reserva estruturada nem I/O de rede próprio). Mesmo espírito de
 * `NotSupportedByGatewayError` em `packages/payments/src/port.ts` — erro de programação do
 * caller (chamou algo que `capabilities` já dizia ser `false`, ou que a arquitetura do pacote não
 * permite), nunca uma falha de runtime de rede/canal.
 */
export class NotSupportedByAdapterError extends Error {
  constructor(
    public readonly channel: Channel,
    reason: string,
  ) {
    super(`Operação não suportada pelo adapter do canal '${channel}': ${reason}`);
    this.name = "NotSupportedByAdapterError";
  }
}
