// Fase 3, Passo 4b (docs/fase-atual.md) — `AirbnbBrowserAutomationAdapter`: implementação de
// `ChannelAdapter` (../port.ts) para o Airbnb via automação de navegador (Playwright) no painel
// de host, usando a conta real da Titan. Decisão de risco explícita do usuário, documentada
// inteira em `docs/adr/0020-automacao-navegador-canais.md` — leia esse ADR antes de mexer aqui.
//
// ATENÇÃO — FRAGILIDADE ESTRUTURAL DOCUMENTADA (ADR-0020, mitigação de design #4): este adapter
// depende do HTML e do fluxo de navegação ATUAIS do painel de host do Airbnb. Pode quebrar sem
// aviso a qualquer momento que o Airbnb mudar layout, fluxo de login, ou adicionar
// captcha/2FA/rate-limit adicional — não há SLA de fornecedor para isso, ao contrário de uma API
// oficial versionada. Isso é um risco de negócio aceito conscientemente (ADR-0020), não um bug a
// esconder ou "consertar" silenciosamente aqui.
//
// TODOS OS SELETORES CSS E O FLUXO DE NAVEGAÇÃO EM `PlaywrightAirbnbDriver` SÃO HIPOTÉTICOS —
// nunca observados nem verificados contra o painel de host real do Airbnb (nenhuma conta
// configurada nesta máquina nesta sessão, nenhuma chamada de rede real foi feita para escrever
// este arquivo). Precisam ser regravados observando o painel de verdade antes de qualquer uso em
// produção — cada suposição específica tem um TODO pontual no corpo de `PlaywrightAirbnbDriver`.
//
// Mitigações de design exigidas pelo ADR-0020, todas implementadas neste arquivo:
//   1. Credenciais só via variável de ambiente (`AIRBNB_HOST_EMAIL`/`AIRBNB_HOST_PASSWORD`),
//      nunca hardcoded, nunca logadas — ver `readCredentialsFromEnv`/`sanitizeError`.
//   2. Circuit breaker (`./circuit-breaker.ts`) — N falhas consecutivas abrem o circuito;
//      `resetCircuitBreaker()` é o religamento manual que o kill switch do cockpit chama.
//   3. Throttling conservador (`./throttle.ts`) — delay mínimo configurável entre ações.
//   4. Kill switch (`disable()`/`enable()`) — desabilitado, nenhum método sequer abre o
//      navegador.
//   5. Fragilidade documentada — este comentário de cabeçalho.
import type { CalendarDelta, Cents, Channel, Divergence, ExternalReservation, RateDelta } from "@titan/domain";
import type { CivilDate } from "@titan/dates";
import { format as formatMoney } from "@titan/money";
import type {
  AckResult,
  ChannelAdapter,
  ChannelCapabilities,
  ListingSnapshot,
  MappingResult,
  Page,
} from "../port";
import { NotSupportedByAdapterError } from "../port";
import { CircuitBreaker, CircuitBreakerOpenError } from "./circuit-breaker";
import { Throttler } from "./throttle";

export { CircuitBreaker, CircuitBreakerOpenError } from "./circuit-breaker";
export { Throttler } from "./throttle";

// ---------------------------------------------------------------------------------------------
// Credenciais — mitigação #1 do ADR-0020.
// ---------------------------------------------------------------------------------------------

export interface AirbnbCredentials {
  readonly email: string;
  readonly password: string;
}

/** Lançado quando as variáveis de ambiente de credencial não estão configuradas. Nunca inclui o
 * valor esperado nem qualquer coisa lida do ambiente na mensagem — só os nomes das variáveis. */
export class MissingAirbnbCredentialsError extends Error {
  constructor() {
    super(
      "AirbnbBrowserAutomationAdapter: credenciais ausentes. Defina as variáveis de ambiente " +
        "AIRBNB_HOST_EMAIL e AIRBNB_HOST_PASSWORD (nunca hardcoded — I4/docs/anti-padroes.md #18).",
    );
    this.name = "MissingAirbnbCredentialsError";
  }
}

/** Lê `AIRBNB_HOST_EMAIL`/`AIRBNB_HOST_PASSWORD` do ambiente. Nomes exatos das variáveis —
 * decisão desta faixa, documentados aqui e no header deste arquivo; nenhum outro nome é aceito. */
export function readCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): AirbnbCredentials {
  const email = env.AIRBNB_HOST_EMAIL;
  const password = env.AIRBNB_HOST_PASSWORD;
  if (!email || !password) {
    throw new MissingAirbnbCredentialsError();
  }
  return { email, password };
}

/** Remove qualquer ocorrência literal do e-mail/senha de uma mensagem de erro antes de deixá-la
 * subir — defesa em profundidade contra stack trace/dump de página que acabe ecoando o payload
 * de login (ex.: Playwright reportando o valor de um campo preenchido em caso de timeout). */
function sanitizeErrorMessage(message: string, credentials: AirbnbCredentials | undefined): string {
  if (!credentials) {
    return message;
  }
  let sanitized = message;
  if (credentials.email) {
    sanitized = sanitized.split(credentials.email).join("[redacted-email]");
  }
  if (credentials.password) {
    sanitized = sanitized.split(credentials.password).join("[redacted-password]");
  }
  return sanitized;
}

function sanitizeError(err: unknown, credentials: AirbnbCredentials | undefined): Error {
  const rawMessage = err instanceof Error ? err.message : String(err);
  const sanitized = new Error(sanitizeErrorMessage(rawMessage, credentials));
  sanitized.name = err instanceof Error ? err.name : "Error";
  return sanitized;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------------------------
// Kill switch — mitigação #4 do ADR-0020.
// ---------------------------------------------------------------------------------------------

/** Lançado por qualquer método do adapter quando `disable()` foi chamado — nenhum navegador é
 * aberto, nenhuma credencial é lida, nenhuma ação de rede acontece nesse caminho. */
export class AdapterDisabledError extends Error {
  constructor() {
    super(
      "AirbnbBrowserAutomationAdapter: adapter desabilitado manualmente — ver /distribuicao no " +
        "cockpit para reativar (kill switch, ADR-0020 mitigação 5).",
    );
    this.name = "AdapterDisabledError";
  }
}

// ---------------------------------------------------------------------------------------------
// Driver de navegador — separa o CONTROLE DE FLUXO (circuit breaker, throttle, kill switch,
// sanitização de erro, todos testáveis sem Playwright) da PARTE QUE DE FATO CHAMA Playwright.
// Os testes (`airbnb-adapter.test.ts`) injetam um driver fake; produção usa
// `PlaywrightAirbnbDriver`.
// ---------------------------------------------------------------------------------------------

export interface BrowserAutomationDriver {
  /** Garante sessão autenticada no painel de host — no-op se a instância já considera a sessão
   * ativa. */
  ensureLoggedIn(credentials: AirbnbCredentials): Promise<void>;
  pushRates(externalListingId: string, rates: readonly RateDelta[]): Promise<void>;
  pushAvailability(externalListingId: string, calendar: readonly CalendarDelta[]): Promise<void>;
  pullReservations(sinceEpochMs: number, cursor: string | undefined): Promise<Page<ExternalReservation>>;
  /** Libera browser/contexto. Chamado por `adapter.dispose()`. */
  dispose(): Promise<void>;
}

export interface PlaywrightAirbnbDriverConfig {
  readonly headless?: boolean;
  /** Caminho de arquivo onde cachear o `storageState` (cookies/sessão) do Playwright entre
   * processos — decisão desta faixa para não fazer login toda chamada. Se omitido, a sessão só
   * é cacheada em memória durante o tempo de vida desta instância (perdida ao reiniciar o
   * processo). */
  readonly storageStatePath?: string;
}

/**
 * Driver real, baseado em Playwright, contra o painel de host do Airbnb.
 *
 * Decisão de sessão: `ensureLoggedIn` só repete o fluxo de login se `loggedIn` ainda for `false`
 * nesta instância — dentro do mesmo processo, o mesmo `BrowserContext` é reaproveitado entre
 * chamadas (evita logar de novo a cada `pushRates`/`pushAvailability`/`pullReservations`). Entre
 * processos/reinícios, `storageStatePath` (se configurado) persiste os cookies em disco para
 * pular o formulário de login de novo — mesma técnica documentada do Playwright para
 * `storageState`.
 */
export class PlaywrightAirbnbDriver implements BrowserAutomationDriver {
  private browser: import("playwright").Browser | undefined;
  private context: import("playwright").BrowserContext | undefined;
  private loggedIn = false;
  private readonly headless: boolean;
  private readonly storageStatePath: string | undefined;

  constructor(config: PlaywrightAirbnbDriverConfig = {}) {
    this.headless = config.headless ?? true;
    this.storageStatePath = config.storageStatePath;
  }

  private async ensureContext(): Promise<import("playwright").BrowserContext> {
    if (this.context) {
      return this.context;
    }
    // Import dinâmico: mantém o custo de carregar o Playwright (e a dependência de um binário de
    // browser instalado) só para quem de fato usa este driver — o resto do pacote (circuit
    // breaker, throttle, o próprio adapter com um driver fake) nunca paga esse custo.
    const { chromium } = await import("playwright");
    this.browser = await chromium.launch({ headless: this.headless });
    this.context = await this.browser.newContext(
      this.storageStatePath ? { storageState: this.storageStatePath } : {},
    );
    return this.context;
  }

  async ensureLoggedIn(credentials: AirbnbCredentials): Promise<void> {
    if (this.loggedIn) {
      return;
    }
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      // TODO: seletores/fluxo reais precisam ser gravados observando o painel de host de
      // verdade — este é um esqueleto plausível, NÃO verificado contra produção.
      await page.goto("https://www.airbnb.com/login");
      await page.fill('input[name="email"]', credentials.email); // TODO seletor hipotético
      await page.click('button[type="submit"]'); // TODO seletor hipotético
      await page.fill('input[name="password"]', credentials.password); // TODO seletor hipotético
      await page.click('button[data-testid="login-submit"]'); // TODO seletor hipotético
      await page.waitForURL(/airbnb\.com\/hosting/, { timeout: 30_000 }); // TODO fluxo hipotético
      if (this.storageStatePath) {
        await context.storageState({ path: this.storageStatePath });
      }
      this.loggedIn = true;
    } finally {
      await page.close();
    }
  }

  async pushRates(externalListingId: string, rates: readonly RateDelta[]): Promise<void> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      // TODO: URL/seletores hipotéticos do painel de tarifa por dia do Airbnb.
      await page.goto(`https://www.airbnb.com/hosting/listings/${externalListingId}/calendar`);
      for (const rate of rates) {
        // TODO: fluxo hipotético — o painel real provavelmente exige abrir um popover por dia
        // (ou por intervalo selecionado no calendário), não um input direto por linha.
        //
        // Conversão de centavos para string de exibição passa SEMPRE por `format()` de
        // `@titan/money` (o único ponto de entrada sancionado para essa conversão — ver
        // comentário no próprio pacote: "nunca usar para persistência ou cálculo", só exibição,
        // que é exatamente este caso: preencher um campo de texto de UI de terceiro). Nunca
        // fazer essa conversão à mão neste arquivo (docs/anti-padroes.md #9).
        const displayValue = formatMoney(rate.priceAmount).replace(/[^\d,.-]/g, ""); // TODO: painel real pode esperar formato diferente (com ou sem separador de milhar)
        await page.click(`[data-testid="calendar-day-${rate.date}"]`);
        await page.fill('input[data-testid="price-input"]', displayValue);
        await page.click('button[data-testid="save-price"]');
      }
    } finally {
      await page.close();
    }
  }

  async pushAvailability(externalListingId: string, calendar: readonly CalendarDelta[]): Promise<void> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      // TODO: URL/seletores hipotéticos — mesma tela de calendário do pushRates.
      await page.goto(`https://www.airbnb.com/hosting/listings/${externalListingId}/calendar`);
      for (const delta of calendar) {
        await page.click(`[data-testid="calendar-day-${delta.date}"]`);
        const toggleSelector = delta.blocked
          ? 'button[data-testid="block-day"]'
          : 'button[data-testid="unblock-day"]';
        await page.click(toggleSelector); // TODO seletor hipotético
      }
    } finally {
      await page.close();
    }
  }

  async pullReservations(
    sinceEpochMs: number,
    cursor: string | undefined,
  ): Promise<Page<ExternalReservation>> {
    const context = await this.ensureContext();
    const page = await context.newPage();
    try {
      // TODO: URL/paginação hipotéticas da lista de reservas do painel de host.
      const url = cursor
        ? `https://www.airbnb.com/hosting/reservations?cursor=${encodeURIComponent(cursor)}`
        : "https://www.airbnb.com/hosting/reservations";
      await page.goto(url);

      // TODO: seletores hipotéticos de scraping de linha de reserva — nunca verificados contra
      // o painel real. `data-testid`/atributos abaixo são um palpite plausível, não um fato.
      const rows = await page.$$eval('[data-testid="reservation-row"]', (elements) =>
        elements.map((el) => ({
          externalReservationId: el.getAttribute("data-reservation-id") ?? "",
          externalListingId: el.getAttribute("data-listing-id") ?? "",
          guestName: el.querySelector('[data-testid="guest-name"]')?.textContent?.trim() ?? "",
          checkinISO: el.querySelector('[data-testid="checkin-date"]')?.getAttribute("datetime") ?? "",
          checkoutISO:
            el.querySelector('[data-testid="checkout-date"]')?.getAttribute("datetime") ?? "",
          totalAmountDisplay: el.querySelector('[data-testid="total-amount"]')?.textContent ?? "0",
        })),
      );

      const nextCursorHandle = await page.$('[data-testid="pagination-next"]');
      const nextCursorAttr = nextCursorHandle ? await nextCursorHandle.getAttribute("data-cursor") : null;
      const nextCursor = nextCursorAttr ?? undefined;

      // `sinceEpochMs` não filtra por timestamp exato aqui: diferente de uma API real, o painel
      // de host não expõe data de criação/atualização da reserva no scraping — só datas de
      // estadia. TODO: se isso se mostrar insuficiente em produção, considerar heurística de
      // corte por `checkoutISO` muito anterior a `sinceEpochMs` para parar de paginar; por ora,
      // a filtragem por "desde quando" fica a cargo do chamador (que já conhece as reservas já
      // processadas por `externalReservationId`).
      void sinceEpochMs;

      const items: ExternalReservation[] = rows
        .filter((row) => row.externalReservationId !== "")
        .map((row) => ({
          externalReservationId: row.externalReservationId,
          externalListingId: row.externalListingId,
          channel: "airbnb" as Channel,
          checkinISO: row.checkinISO,
          checkoutISO: row.checkoutISO,
          // `exactOptionalPropertyTypes` (tsconfig.base.json) distingue "chave ausente" de
          // "chave presente com undefined" — espalhar condicionalmente em vez de escrever
          // `guestName: row.guestName || undefined` (que seria rejeitado pelo compilador).
          ...(row.guestName ? { guestName: row.guestName } : {}),
          totalAmountCents: parseAmountCentsFromDisplayValue(row.totalAmountDisplay),
          currency: "BRL", // TODO: moeda hipotética — o painel real pode reportar por reserva.
        }));

      // Mesma razão do `guestName` acima: `Page.nextCursor` é opcional sem `| undefined`
      // explícito.
      return nextCursor !== undefined ? { items, nextCursor } : { items };
    } finally {
      await page.close();
    }
  }

  async dispose(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = undefined;
    this.browser = undefined;
    this.loggedIn = false;
  }
}

/**
 * TODO: formato hipotético de exibição ("R$ 1.234,56", separador decimal em vírgula) — o parsing
 * real depende do locale/moeda que o painel de host efetivamente renderiza, nunca verificado
 * contra produção.
 *
 * Deliberadamente sem `parseFloat`/divisão em ponto flutuante: separa a parte inteira (reais) da
 * parte decimal (centavos) como STRINGS antes de combinar em um inteiro de centavos — mesmo
 * espírito de "dinheiro é sempre inteiro" mesmo neste parsing de scraping, não só no que já vem
 * como `Money`/`Cents` de outros pacotes (docs/anti-padroes.md #9).
 */
function parseAmountCentsFromDisplayValue(raw: string): Cents {
  const digitsAndSeparator = raw.replace(/[^\d,]/g, "");
  const [wholePartRaw, centsPartRaw] = digitsAndSeparator.split(",");
  const wholePart = (wholePartRaw ?? "").replace(/\D/g, "") || "0";
  const centsPart = (centsPartRaw ?? "00").padEnd(2, "0").slice(0, 2);
  const wholeUnits = Number.parseInt(wholePart, 10);
  const centsUnits = Number.parseInt(centsPart, 10);
  if (!Number.isFinite(wholeUnits) || !Number.isFinite(centsUnits)) {
    return 0 as Cents;
  }
  return (wholeUnits * 100 + centsUnits) as Cents;
}

// ---------------------------------------------------------------------------------------------
// Adapter — implementa `ChannelAdapter` (../port.ts), compõe kill switch + circuit breaker +
// throttle em torno do driver injetado.
// ---------------------------------------------------------------------------------------------

const DEFAULT_MIN_DELAY_MS = 3_000;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 3;

const AIRBNB_CAPABILITIES: ChannelCapabilities = {
  pushRates: true,
  // Restrição de estadia (min-stay/vigência) fora de escopo desta fase — o painel de host tem
  // uma tela própria para isso que este adapter ainda não cobre; expandir é trabalho futuro, não
  // um "false" permanente.
  pushRestrictions: false,
  pullReservations: true,
  // Conteúdo rico de listing (fotos, amenidades, descrição) fica fora de escopo desta fase —
  // F3 é sobre distribuição de tarifa/disponibilidade/reserva, não sobre gestão de conteúdo de
  // anúncio.
  pushContent: false,
  // Reserva instantânea é configuração do próprio painel Airbnb (ligada/desligada pelo host lá),
  // não uma capacidade que este adapter controla ou aciona.
  instantBooking: false,
  // Mensageria de hóspede é escopo do Concierge (Fase 10 — docs/roadmap.md), não deste canal.
  messaging: false,
};

export interface AirbnbAdapterConfig {
  /** Se omitido, lido de `AIRBNB_HOST_EMAIL`/`AIRBNB_HOST_PASSWORD` no momento de cada ação
   * (nunca cacheado em texto puro além do necessário para a chamada Playwright em si). */
  readonly credentials?: AirbnbCredentials;
  /** Delay mínimo (ms) entre ações consecutivas de navegador. Default: 3000ms — conservador de
   * propósito (ADR-0020 mitigação #3), nunca rajada. */
  readonly minDelayMs?: number;
  /** Falhas consecutivas até o circuito abrir. Default: 3. */
  readonly circuitBreakerThreshold?: number;
  /** Estado inicial do kill switch. Default: `true` (habilitado). */
  readonly enabled?: boolean;
  /** Injetável para teste — produção usa `PlaywrightAirbnbDriver` por default. */
  readonly driver?: BrowserAutomationDriver;
  /** Relógio injetável para teste (throttle). Default: `Date.now`. */
  readonly now?: () => number;
  /** Injetável para teste (`readCredentialsFromEnv`) — evita que o teste de credenciais
   * ausentes dependa do ambiente real da máquina. Default: `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
}

export class AirbnbBrowserAutomationAdapter implements ChannelAdapter {
  readonly channel: Channel = "airbnb";
  readonly capabilities: ChannelCapabilities = AIRBNB_CAPABILITIES;

  private readonly credentials: AirbnbCredentials | undefined;
  private readonly env: NodeJS.ProcessEnv | undefined;
  private readonly driver: BrowserAutomationDriver;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly throttler: Throttler;
  private enabled: boolean;

  constructor(config: AirbnbAdapterConfig = {}) {
    this.credentials = config.credentials;
    this.env = config.env;
    this.driver = config.driver ?? new PlaywrightAirbnbDriver();
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: config.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD,
    });
    this.throttler = new Throttler({
      minDelayMs: config.minDelayMs ?? DEFAULT_MIN_DELAY_MS,
      // `exactOptionalPropertyTypes` — só inclui a chave `now` quando de fato fornecida, em vez
      // de repassar `config.now` (tipo `(() => number) | undefined`) direto para uma chave
      // opcional sem `| undefined` explícito.
      ...(config.now ? { now: config.now } : {}),
    });
    this.enabled = config.enabled ?? true;
  }

  // --- Kill switch (ADR-0020 mitigação #4) ------------------------------------------------

  /** Desliga a automação deste canal imediatamente. Nenhum método volta a abrir navegador
   * nenhum enquanto desabilitado — chamado pelo controle do cockpit em `/distribuicao`, sem
   * precisar de deploy. */
  disable(): void {
    this.enabled = false;
  }

  /** Religa a automação depois de um `disable()` manual. Decisão deliberada: NÃO reseta o
   * circuit breaker sozinho — "eu quero religar a automação" e "eu confio que o problema que
   * abriu o circuito já passou" são duas decisões humanas distintas; chame também
   * `resetCircuitBreaker()` explicitamente quando ambas forem verdadeiras. */
  enable(): void {
    this.enabled = true;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  // --- Circuit breaker (ADR-0020 mitigação #2) --------------------------------------------

  /** Kill switch de recuperação do circuit breaker — religa depois de N falhas consecutivas
   * terem aberto o circuito. Mesmo controle do cockpit em `/distribuicao` chama isto. */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
  }

  isCircuitBreakerOpen(): boolean {
    return this.circuitBreaker.isOpen();
  }

  // --- Núcleo de controle de fluxo ---------------------------------------------------------

  /**
   * Toda ação de navegador passa por aqui: kill switch primeiro (nunca abre navegador se
   * desabilitado), depois circuit breaker (nunca chama `action` se o circuito está aberto),
   * throttle dentro da proteção do breaker, e sanitização de qualquer erro antes de propagar.
   */
  private async guardedAction<T>(action: () => Promise<T>): Promise<T> {
    if (!this.enabled) {
      throw new AdapterDisabledError();
    }
    return this.circuitBreaker.run(async () => {
      await this.throttler.waitForTurn();
      try {
        return await action();
      } catch (err) {
        throw sanitizeError(err, this.credentials);
      }
    });
  }

  private resolveCredentials(): AirbnbCredentials {
    return this.credentials ?? readCredentialsFromEnv(this.env);
  }

  // --- ChannelAdapter ------------------------------------------------------------------------

  async syncContent(listing: ListingSnapshot): Promise<MappingResult> {
    // capabilities.pushContent = false — nenhum conteúdo de listing é sincronizado por este
    // adapter nesta fase (ver comentário em AIRBNB_CAPABILITIES). Mesmo padrão de
    // `IcalChannelAdapter` para operações fora de escopo: lançar, nunca fingir sucesso vazio.
    throw new NotSupportedByAdapterError(
      this.channel,
      `pushContent: false — este adapter não sincroniza conteúdo de anúncio (unitId: ${listing.unitId}). ` +
        "O mapeamento unit↔listing (ListingMapping) é responsabilidade do bounded context " +
        "`distribution`, não deste driver de navegador.",
    );
  }

  async pushAvailability(unitId: string, calendar: readonly CalendarDelta[]): Promise<AckResult> {
    try {
      await this.guardedAction(async () => {
        const credentials = this.resolveCredentials();
        await this.driver.ensureLoggedIn(credentials);
        await this.driver.pushAvailability(unitId, calendar);
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError || err instanceof AdapterDisabledError) {
        throw err;
      }
      return { ok: false, detail: describeError(err) };
    }
  }

  async pushRates(unitId: string, rates: readonly RateDelta[]): Promise<AckResult> {
    try {
      await this.guardedAction(async () => {
        const credentials = this.resolveCredentials();
        await this.driver.ensureLoggedIn(credentials);
        await this.driver.pushRates(unitId, rates);
      });
      return { ok: true };
    } catch (err) {
      if (err instanceof CircuitBreakerOpenError || err instanceof AdapterDisabledError) {
        throw err;
      }
      return { ok: false, detail: describeError(err) };
    }
  }

  async pullReservations(sinceEpochMs: number, cursor?: string): Promise<Page<ExternalReservation>> {
    // Sem try/catch de conversão para AckResult aqui: `Page<T>` não tem um shape de "falha"
    // (diferente de AckResult), então kill switch/circuit breaker/erro de automação sempre
    // propagam como exceção real — o caller (apps/worker) precisa tratar isso explicitamente.
    return this.guardedAction(async () => {
      const credentials = this.resolveCredentials();
      await this.driver.ensureLoggedIn(credentials);
      return this.driver.pullReservations(sinceEpochMs, cursor);
    });
  }

  async handleWebhook(_raw: unknown): Promise<unknown[]> {
    // Airbnb não expõe webhook nenhum para automação de navegador (não há API oficial neste
    // caminho) — não é uma capability listada em ChannelCapabilities (mesma observação já feita
    // em port.ts/ical/adapter.ts), então documentamos lançando, mesmo padrão do `IcalChannelAdapter`
    // para "operação que este adapter nunca vai suportar de verdade" em vez de devolver `[]`
    // silenciosamente (o que poderia mascarar alguém tendo cadastrado uma rota de webhook por
    // engano).
    throw new NotSupportedByAdapterError(
      this.channel,
      "Automação de navegador não recebe webhook — Airbnb nunca nos notifica por essa via; " +
        "reservas chegam só via pullReservations() (polling/scraping).",
    );
  }

  async reconcile(
    _unitId: string,
    _rangeStart: CivilDate,
    _rangeEnd: CivilDate,
  ): Promise<Divergence[]> {
    // Mesmo raciocínio estrutural de `IcalChannelAdapter.reconcile` (../ical/adapter.ts): este
    // pacote não tem acesso ao snapshot LOCAL (fonte de verdade em packages/db) — só ao remoto,
    // via scraping. Reconciliação real compõe o snapshot remoto (obtido daqui, de uma chamada
    // de scraping ainda não exposta como método público de leitura pura) com o snapshot local
    // (buscado pelo caller) através de `detectAvailabilityDrift`/`detectRateDrift` de
    // `@titan/domain` — composição que cabe ao orquestrador (apps/worker), fora de escopo desta
    // faixa.
    throw new NotSupportedByAdapterError(
      this.channel,
      "reconcile() não é implementado neste adapter — sem acesso ao snapshot local (packages/db). " +
        "Componha detectAvailabilityDrift/detectRateDrift (@titan/domain) com o snapshot remoto " +
        "na borda (apps/worker).",
    );
  }

  /** Libera o browser/contexto do driver subjacente. Não é parte de `ChannelAdapter` — chamado
   * explicitamente por quem instanciou este adapter ao encerrar (ex.: fim de um job do worker). */
  async dispose(): Promise<void> {
    await this.driver.dispose();
  }
}
