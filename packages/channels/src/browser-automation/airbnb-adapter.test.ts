// Fase 3, Passo 4b — testes do `AirbnbBrowserAutomationAdapter` e das três mitigações do
// ADR-0020 exigidas neste arquivo (circuit breaker, kill switch, throttling). Nenhum teste aqui
// toca Playwright de verdade nem o Airbnb real — o `BrowserAutomationDriver` é sempre um fake
// injetado (`vi.fn()`), exatamente o ponto de separar controle de fluxo (testável) da parte que
// chama `page.goto()`/`page.click()` (não testável sem uma conta real, fora de escopo desta
// sessão).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { civilDate } from "@titan/dates";
import { money } from "@titan/money";
import type { CalendarDelta, RateDelta } from "@titan/domain";
import type { Page } from "../port";
import {
  AdapterDisabledError,
  AirbnbBrowserAutomationAdapter,
  type AirbnbCredentials,
  type BrowserAutomationDriver,
  CircuitBreaker,
  CircuitBreakerOpenError,
  Throttler,
} from "./airbnb-adapter";
import type { ExternalReservation } from "@titan/domain";

const CREDENTIALS: AirbnbCredentials = { email: "host@titan.example", password: "senha-forte" };

function createFakeDriver(overrides: Partial<BrowserAutomationDriver> = {}): {
  driver: BrowserAutomationDriver;
  ensureLoggedIn: ReturnType<typeof vi.fn>;
  pushRates: ReturnType<typeof vi.fn>;
  pushAvailability: ReturnType<typeof vi.fn>;
  pullReservations: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  const ensureLoggedIn = vi.fn(overrides.ensureLoggedIn ?? (async () => {}));
  const pushRates = vi.fn(overrides.pushRates ?? (async () => {}));
  const pushAvailability = vi.fn(overrides.pushAvailability ?? (async () => {}));
  const pullReservations = vi.fn(
    overrides.pullReservations ?? (async (): Promise<Page<ExternalReservation>> => ({ items: [] })),
  );
  const dispose = vi.fn(overrides.dispose ?? (async () => {}));

  return {
    driver: { ensureLoggedIn, pushRates, pushAvailability, pullReservations, dispose },
    ensureLoggedIn,
    pushRates,
    pushAvailability,
    pullReservations,
    dispose,
  };
}

const SAMPLE_RATES: readonly RateDelta[] = [
  { unitId: "unit-1", date: civilDate("2026-09-01"), priceAmount: money(50_000, "BRL") },
];

const SAMPLE_CALENDAR: readonly CalendarDelta[] = [
  { unitId: "unit-1", date: civilDate("2026-09-01"), blocked: true },
];

describe("CircuitBreaker — unidade isolada, sem Playwright", () => {
  it("abre depois de N falhas consecutivas e volta a fechar só com reset() manual", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    const failingAction = async () => {
      throw new Error("falha simulada de navegação");
    };

    await expect(breaker.run(failingAction)).rejects.toThrow("falha simulada de navegação");
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getConsecutiveFailures()).toBe(1);

    await expect(breaker.run(failingAction)).rejects.toThrow("falha simulada de navegação");
    expect(breaker.isOpen()).toBe(true);
    expect(breaker.getConsecutiveFailures()).toBe(2);

    // Circuito aberto: a ação NUNCA é chamada de novo — só o erro claro é lançado.
    const actionAfterOpen = vi.fn(async () => "não deveria rodar");
    await expect(breaker.run(actionAfterOpen)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(actionAfterOpen).not.toHaveBeenCalled();

    breaker.reset();
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.getConsecutiveFailures()).toBe(0);
    await expect(breaker.run(async () => "ok")).resolves.toBe("ok");
  });

  it("sucesso zera o contador de falhas consecutivas", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    await expect(breaker.run(async () => { throw new Error("falha 1"); })).rejects.toThrow();
    expect(breaker.getConsecutiveFailures()).toBe(1);

    await expect(breaker.run(async () => "ok")).resolves.toBe("ok");
    expect(breaker.getConsecutiveFailures()).toBe(0);
    expect(breaker.isOpen()).toBe(false);
  });
});

describe("Throttler — delay mínimo configurável, sem esperar tempo real na maioria dos casos", () => {
  it("msUntilNextActionAllowed reflete corretamente o relógio injetado", async () => {
    let currentTimeMs = 0;
    const throttler = new Throttler({ minDelayMs: 5_000, now: () => currentTimeMs });

    // Nenhuma ação ainda registrada — sempre liberado.
    expect(throttler.msUntilNextActionAllowed()).toBe(0);

    // Primeira chamada: `msUntilNextActionAllowed()` já era 0, então não há espera real nenhuma
    // (resolve na hora, sem passar por `setTimeout` de verdade).
    await throttler.waitForTurn();

    currentTimeMs = 2_000; // passaram-se 2s (simulado, sem esperar de verdade)
    expect(throttler.msUntilNextActionAllowed()).toBe(3_000);

    currentTimeMs = 5_000; // passaram-se 5s no total desde a última ação
    expect(throttler.msUntilNextActionAllowed()).toBe(0);

    currentTimeMs = 9_000; // bem além do delay mínimo — nunca fica negativo
    expect(throttler.msUntilNextActionAllowed()).toBe(0);
  });

  it("waitForTurn() de fato aguarda o delay mínimo antes de liberar a próxima ação", async () => {
    vi.useFakeTimers();
    try {
      const throttler = new Throttler({ minDelayMs: 2_000 });

      await throttler.waitForTurn(); // primeira ação, sem histórico — libera na hora

      let secondResolved = false;
      void throttler.waitForTurn().then(() => {
        secondResolved = true;
      });

      await vi.advanceTimersByTimeAsync(1_000);
      expect(secondResolved).toBe(false); // só 1s dos 2s mínimos se passou

      await vi.advanceTimersByTimeAsync(1_000);
      expect(secondResolved).toBe(true); // completou os 2s — libera
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AirbnbBrowserAutomationAdapter — circuit breaker integrado", () => {
  it("depois de N falhas consecutivas do driver, chamadas seguintes falham imediatamente com CircuitBreakerOpenError, sem chamar o driver de novo", async () => {
    const { driver, pushRates } = createFakeDriver({
      pushRates: async () => {
        throw new Error("falha de navegação simulada (seletor não encontrado)");
      },
    });

    const adapter = new AirbnbBrowserAutomationAdapter({
      credentials: CREDENTIALS,
      driver,
      circuitBreakerThreshold: 3,
      minDelayMs: 0,
    });

    const r1 = await adapter.pushRates("unit-1", SAMPLE_RATES);
    const r2 = await adapter.pushRates("unit-1", SAMPLE_RATES);
    const r3 = await adapter.pushRates("unit-1", SAMPLE_RATES);

    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(false);
    expect(r3.ok).toBe(false);
    expect(pushRates).toHaveBeenCalledTimes(3);
    expect(adapter.isCircuitBreakerOpen()).toBe(true);

    // Circuito já aberto: a 4ª chamada falha IMEDIATAMENTE com CircuitBreakerOpenError, e o
    // driver fake NUNCA é chamado de novo (nenhum "navegador" seria aberto em produção).
    await expect(adapter.pushRates("unit-1", SAMPLE_RATES)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(pushRates).toHaveBeenCalledTimes(3);

    adapter.resetCircuitBreaker();
    expect(adapter.isCircuitBreakerOpen()).toBe(false);
  });
});

describe("AirbnbBrowserAutomationAdapter — kill switch (disable/enable)", () => {
  it("disable() faz todo método falhar imediatamente sem chamar o driver (nenhum navegador é aberto)", async () => {
    const { driver, ensureLoggedIn, pushAvailability, pullReservations } = createFakeDriver();

    const adapter = new AirbnbBrowserAutomationAdapter({
      credentials: CREDENTIALS,
      driver,
      minDelayMs: 0,
    });

    adapter.disable();
    expect(adapter.isEnabled()).toBe(false);

    await expect(adapter.pushAvailability("unit-1", SAMPLE_CALENDAR)).rejects.toBeInstanceOf(
      AdapterDisabledError,
    );
    await expect(adapter.pullReservations(0)).rejects.toBeInstanceOf(AdapterDisabledError);

    expect(ensureLoggedIn).not.toHaveBeenCalled();
    expect(pushAvailability).not.toHaveBeenCalled();
    expect(pullReservations).not.toHaveBeenCalled();

    adapter.enable();
    expect(adapter.isEnabled()).toBe(true);

    const result = await adapter.pushAvailability("unit-1", SAMPLE_CALENDAR);
    expect(result.ok).toBe(true);
    expect(ensureLoggedIn).toHaveBeenCalledTimes(1);
    expect(pushAvailability).toHaveBeenCalledTimes(1);
  });

  it("enable() não religa o circuit breaker sozinho — são duas decisões distintas", async () => {
    const { driver } = createFakeDriver({
      pushRates: async () => {
        throw new Error("falha simulada");
      },
    });

    const adapter = new AirbnbBrowserAutomationAdapter({
      credentials: CREDENTIALS,
      driver,
      circuitBreakerThreshold: 1,
      minDelayMs: 0,
    });

    await adapter.pushRates("unit-1", SAMPLE_RATES); // 1 falha já abre o circuito (threshold: 1)
    expect(adapter.isCircuitBreakerOpen()).toBe(true);

    adapter.disable();
    adapter.enable();
    // Ainda aberto: enable() só religa o kill switch manual, não o circuit breaker.
    expect(adapter.isCircuitBreakerOpen()).toBe(true);
    await expect(adapter.pushRates("unit-1", SAMPLE_RATES)).rejects.toBeInstanceOf(CircuitBreakerOpenError);

    adapter.resetCircuitBreaker();
    expect(adapter.isCircuitBreakerOpen()).toBe(false);
  });
});

describe("AirbnbBrowserAutomationAdapter — throttling integrado", () => {
  it("respeita o delay mínimo configurado entre duas ações consecutivas de navegador", async () => {
    vi.useFakeTimers();
    try {
      const { driver, pushRates } = createFakeDriver();
      const adapter = new AirbnbBrowserAutomationAdapter({
        credentials: CREDENTIALS,
        driver,
        minDelayMs: 2_000,
      });

      const firstCall = adapter.pushRates("unit-1", SAMPLE_RATES);
      await vi.advanceTimersByTimeAsync(0);
      await firstCall;
      expect(pushRates).toHaveBeenCalledTimes(1);

      let secondSettled = false;
      const secondCallPromise = adapter.pushRates("unit-1", SAMPLE_RATES).then(() => {
        secondSettled = true;
      });

      await vi.advanceTimersByTimeAsync(500);
      expect(secondSettled).toBe(false); // ainda dentro do delay mínimo de 2000ms

      await vi.advanceTimersByTimeAsync(2_000);
      await secondCallPromise;
      expect(secondSettled).toBe(true);
      expect(pushRates).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("AirbnbBrowserAutomationAdapter — capabilities e operações fora de escopo", () => {
  it("declara as capabilities documentadas para esta fase", () => {
    const { driver } = createFakeDriver();
    const adapter = new AirbnbBrowserAutomationAdapter({ credentials: CREDENTIALS, driver });

    expect(adapter.channel).toBe("airbnb");
    expect(adapter.capabilities).toEqual({
      pushRates: true,
      pushRestrictions: false,
      pullReservations: true,
      pushContent: false,
      instantBooking: false,
      messaging: false,
    });
  });

  it("syncContent, handleWebhook e reconcile lançam NotSupportedByAdapterError (documentado, não escondido)", async () => {
    const { driver } = createFakeDriver();
    const adapter = new AirbnbBrowserAutomationAdapter({ credentials: CREDENTIALS, driver });

    await expect(adapter.syncContent({ unitId: "unit-1", name: "Studio Centro" })).rejects.toThrow();
    await expect(adapter.handleWebhook({})).rejects.toThrow();
    await expect(
      adapter.reconcile("unit-1", civilDate("2026-09-01"), civilDate("2026-09-10")),
    ).rejects.toThrow();
  });
});

describe("readCredentialsFromEnv / MissingAirbnbCredentialsError", () => {
  it("lança MissingAirbnbCredentialsError sem credenciais configuradas, sem vazar valor nenhum na mensagem", async () => {
    const { driver, ensureLoggedIn } = createFakeDriver();
    // Sem `credentials` no config — força a leitura do ambiente. `env: {}` injetado para o
    // teste nunca depender de quais variáveis a máquina real tem configuradas.
    const adapter = new AirbnbBrowserAutomationAdapter({ driver, minDelayMs: 0, env: {} });

    await expect(adapter.pushRates("unit-1", SAMPLE_RATES)).resolves.toMatchObject({ ok: false });
    expect(ensureLoggedIn).not.toHaveBeenCalled();
  });
});
