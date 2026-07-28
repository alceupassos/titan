// Fase 3, Passo 4a — `IcalChannelAdapter`: implementação de `ChannelAdapter` (../port.ts) para
// qualquer canal cuja única via de sincronização seja iCal (Airbnb hoje sem certificação direta,
// e potencialmente Booking/VRBO/Expedia como fallback) — o mesmo código de adapter serve aos
// quatro canais, parametrizado por `channel` no construtor; só a URL do feed por
// unidade/canal muda, e isso é responsabilidade de quem instancia (apps/worker), não deste
// pacote.
//
// Limitação real do iCal, documentada aqui em vez de fingida (prompt.md, seção 9.2): "iCal —
// disponibilidade unidirecional, latência de minutos a horas, sem tarifas nem reservas
// estruturadas". Consequência direta em `capabilities`: `pushRates`, `pushRestrictions`,
// `pullReservations`, `pushContent`, `instantBooking` e `messaging` são todos `false`. Cada
// método cuja capacidade correspondente é `false` lança `NotSupportedByAdapterError` em vez de
// fingir suporte (nunca retorna sucesso vazio silencioso) — mesmo padrão que
// `packages/payments/src/asaas/adapter.ts` já usa para `capture()` num gateway PIX-only.
//
// `reconcile()` merece nota à parte: além de o iCal não ter reserva/tarifa estruturada, este
// PACOTE não faz I/O de rede (quem busca a URL do feed é a borda — apps/worker). Por isso
// `reconcile()` também lança `NotSupportedByAdapterError` aqui, mesmo sem uma capability
// dedicada para isso no contrato comum — o caller real de reconciliação de disponibilidade deve
// chamar `parseIcsFeed(icsText, unitId)` (com o texto do feed já baixado pela borda) e depois
// `detectAvailabilityDrift` de `@titan/domain` diretamente, em vez de passar por este método.
import type { Channel, CalendarDelta, RateDelta, ExternalReservation, Divergence } from "@titan/domain";
import type { CivilDate } from "@titan/dates";
import type {
  ChannelAdapter,
  ChannelCapabilities,
  ListingSnapshot,
  MappingResult,
  AckResult,
  Page,
} from "../port";
import { NotSupportedByAdapterError } from "../port";
import { generateIcsFeed, parseIcsFeed } from "./feed";

export { generateIcsFeed, parseIcsFeed } from "./feed";
export type { GenerateIcsFeedResult } from "./feed";

const ICAL_CAPABILITIES: ChannelCapabilities = {
  pushRates: false,
  pushRestrictions: false,
  pullReservations: false,
  pushContent: false,
  instantBooking: false,
  messaging: false,
};

export class IcalChannelAdapter implements ChannelAdapter {
  readonly capabilities = ICAL_CAPABILITIES;

  /** `channel` é injetado — o mesmo `IcalChannelAdapter` serve Airbnb/Booking/VRBO/Expedia, já
   * que o formato de feed é padrão RFC 5545 nos quatro; só a URL do feed (fora de escopo deste
   * pacote) muda por canal/unidade. */
  constructor(readonly channel: Channel) {}

  async syncContent(_listing: ListingSnapshot): Promise<MappingResult> {
    // iCal não carrega conteúdo de anúncio (fotos, amenidades, descrição) — não há o que
    // sincronizar. `pushContent: false` em capabilities já avisa disso; lançar aqui em vez de
    // devolver um MappingResult de sucesso vazio evita o caller assumir, por engano, que o
    // conteúdo foi de fato publicado no canal.
    throw new NotSupportedByAdapterError(
      this.channel,
      "iCal não tem conceito de conteúdo de anúncio (pushContent: false) — nada a sincronizar.",
    );
  }

  async pushAvailability(unitId: string, calendar: readonly CalendarDelta[]): Promise<AckResult> {
    // Único método "de escrita" que o iCal de fato suporta. Mas iCal é PULL do lado do canal
    // externo (ele busca a URL do nosso feed periodicamente) — não existe uma chamada de API para
    // "empurrar" o dado. Por isso "pushAvailability" aqui não faz nenhuma chamada de rede: gera o
    // TEXTO do feed `.ics` e devolve em `AckResult.detail` para o chamador (apps/worker) persistir
    // e servir na rota HTTP do feed — essa exposição é responsabilidade da borda, fora de escopo
    // deste pacote. Esta é a divergência mais deliberada desta faixa em relação ao verbo "push"
    // do contrato comum: para os canais de API direta (futuros, outras faixas), `pushAvailability`
    // fará uma chamada de rede de verdade; para iCal, "push" significa "gerar o conteúdo que será
    // servido", documentado aqui para não confundir os dois sentidos.
    const result = generateIcsFeed(unitId, calendar, Date.now());
    // `detail` carrega o `.ics` PURO (sem preâmbulo) para o caller poder gravar/servir sem
    // parsear nada. `result.skippedOtherUnit` (deltas de outra unidade ignorados) não entra
    // aqui — quem precisar dessa contagem chama `generateIcsFeed` diretamente (exportado no
    // barrel deste módulo) em vez de depender do `AckResult` genérico para um detalhe que só
    // faz sentido para este adapter específico.
    return {
      ok: true,
      detail: result.icsText,
    } satisfies AckResult;
  }

  async pushRates(_unitId: string, _rates: readonly RateDelta[]): Promise<AckResult> {
    throw new NotSupportedByAdapterError(
      this.channel,
      "iCal não carrega tarifa (pushRates: false) — formato só tem disponibilidade.",
    );
  }

  async pullReservations(
    _sinceEpochMs: number,
    _cursor?: string,
  ): Promise<Page<ExternalReservation>> {
    // iCal de terceiro entrega bloqueio de disponibilidade, não reserva estruturada (sem
    // hóspede/valor/moeda) — não há como preencher um `ExternalReservation` de verdade.
    // `pullReservations: false` em capabilities já avisa; lançar em vez de devolver página vazia
    // evita o caller (ex.: worker de ingestão) achar, por engano, que "zero itens" significa
    // "sem reserva nova" em vez de "este adapter não suporta a operação".
    throw new NotSupportedByAdapterError(
      this.channel,
      "iCal não entrega reserva estruturada (pullReservations: false) — só bloqueio de calendário. " +
        "Use `parseIcsFeed` + `detectAvailabilityDrift` para reconciliar disponibilidade.",
    );
  }

  async handleWebhook(_raw: unknown): Promise<unknown[]> {
    // iCal não tem webhook — o canal externo só faz polling periódico da URL do nosso feed; nunca
    // nos notifica. Não há capability dedicada para "tem webhook" no contrato comum (mensageria
    // não é o mesmo conceito), então documentamos a decisão aqui em vez de forçar um campo novo em
    // `ChannelCapabilities` só para este caso único.
    throw new NotSupportedByAdapterError(this.channel, "iCal não tem conceito de webhook.");
  }

  async reconcile(
    _unitId: string,
    _rangeStart: CivilDate,
    _rangeEnd: CivilDate,
  ): Promise<Divergence[]> {
    // Ver comentário de topo do arquivo: este pacote não faz I/O de rede, então este adapter não
    // pode buscar o feed remoto sozinho para comparar com o snapshot local. Reconciliação de
    // disponibilidade de verdade é: borda busca a URL do feed -> `parseIcsFeed(icsText, unitId)`
    // -> `detectAvailabilityDrift(local, remoto, params)` de `@titan/domain`, tudo fora deste
    // método. Mantido no contrato comum só para `IcalChannelAdapter` continuar sendo um
    // `ChannelAdapter` válido polimorficamente; chamar isto diretamente é erro de programação do
    // caller.
    throw new NotSupportedByAdapterError(
      this.channel,
      "iCal não busca seu próprio feed remoto (pacote sem I/O de rede) — reconcilie chamando " +
        "parseIcsFeed(icsText, unitId) + detectAvailabilityDrift diretamente na borda.",
    );
  }
}
