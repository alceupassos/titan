// Fase 3, Passo 4b — circuit breaker genérico usado pelo adapter Airbnb de automação de
// navegador (ADR-0020, mitigação de design #2: "após N falhas consecutivas, o adapter entra em
// estado 'aberto' e toda chamada subsequente falha IMEDIATAMENTE, sem tentar de novo").
//
// Zero dependência de Playwright/rede aqui de propósito — esta classe só conta falhas e decide
// se deixa `run()` chamar a ação ou não, para poder ser testada sem navegador nenhum
// (`airbnb-adapter.test.ts`).

/**
 * Lançado quando o circuito está aberto — `run()` nunca chama a ação protegida neste caso, então
 * nenhum navegador é aberto nem requisição nenhuma é feita.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(public readonly consecutiveFailures: number) {
    super(
      `Circuit breaker aberto após ${consecutiveFailures} falha(s) consecutiva(s) — chamadas ` +
        "bloqueadas até reset() manual (kill switch do cockpit em /distribuicao, ADR-0020).",
    );
    this.name = "CircuitBreakerOpenError";
  }
}

export interface CircuitBreakerConfig {
  /** Número de falhas consecutivas que abre o circuito. */
  readonly failureThreshold: number;
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private consecutiveFailures = 0;
  private open = false;

  constructor(config: CircuitBreakerConfig) {
    if (config.failureThreshold < 1) {
      throw new RangeError("CircuitBreaker: failureThreshold precisa ser >= 1.");
    }
    this.failureThreshold = config.failureThreshold;
  }

  isOpen(): boolean {
    return this.open;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Executa `action` protegida pelo circuito. Se o circuito já está aberto, lança
   * `CircuitBreakerOpenError` IMEDIATAMENTE, sem invocar `action` — é assim que o kill switch
   * automático evita abrir um novo navegador depois de N falhas seguidas. Sucesso zera o
   * contador; falha incrementa e, ao atingir `failureThreshold`, abre o circuito.
   */
  async run<T>(action: () => Promise<T>): Promise<T> {
    if (this.open) {
      throw new CircuitBreakerOpenError(this.consecutiveFailures);
    }
    try {
      const result = await action();
      this.consecutiveFailures = 0;
      return result;
    } catch (err) {
      this.consecutiveFailures += 1;
      if (this.consecutiveFailures >= this.failureThreshold) {
        this.open = true;
      }
      throw err;
    }
  }

  /**
   * Kill switch manual de religamento (ADR-0020, mitigação #2: "um método `reset()` ou similar
   * para religar manualmente"). Chamado pelo controle do cockpit em `/distribuicao` depois de
   * confirmação humana de que o problema que abriu o circuito foi endereçado.
   */
  reset(): void {
    this.open = false;
    this.consecutiveFailures = 0;
  }
}
