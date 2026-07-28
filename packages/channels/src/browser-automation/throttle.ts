// Fase 3, Passo 4b — throttling conservador entre ações consecutivas no navegador (ADR-0020,
// mitigação de design #3: "um delay mínimo configurável entre ações consecutivas... nunca rajada
// de cliques/requisições"). O relógio (`now`) é injetável para o teste poder controlar o tempo
// sem depender de espera real (`airbnb-adapter.test.ts` usa timers falsos do vitest).
export interface ThrottlerConfig {
  /** Delay mínimo, em ms, entre o fim de uma ação e o início da próxima. Default generoso —
   * decisão do adapter que instancia isto, não desta classe. */
  readonly minDelayMs: number;
  /** Injetável para teste. Default: `Date.now`. */
  readonly now?: () => number;
}

export class Throttler {
  private readonly minDelayMs: number;
  private readonly now: () => number;
  private lastActionAtEpochMs: number | undefined;

  constructor(config: ThrottlerConfig) {
    if (config.minDelayMs < 0) {
      throw new RangeError("Throttler: minDelayMs não pode ser negativo.");
    }
    this.minDelayMs = config.minDelayMs;
    this.now = config.now ?? Date.now;
  }

  /** Quantos ms ainda faltam até a próxima ação ser permitida (0 se já pode agora ou se ainda
   * não houve nenhuma ação registrada). Método puro — não espera nem registra nada; existe
   * separado de `waitForTurn()` para o teste poder verificar a lógica de delay sem precisar
   * aguardar tempo real nenhum. */
  msUntilNextActionAllowed(): number {
    if (this.lastActionAtEpochMs === undefined) {
      return 0;
    }
    const elapsedMs = this.now() - this.lastActionAtEpochMs;
    return Math.max(0, this.minDelayMs - elapsedMs);
  }

  /** Aguarda o delay mínimo necessário (se algum) e então registra o instante desta ação como o
   * novo "último". Toda ação de navegador do adapter passa por aqui antes de rodar — nunca rajada
   * de chamadas consecutivas. */
  async waitForTurn(): Promise<void> {
    const waitMs = this.msUntilNextActionAllowed();
    if (waitMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastActionAtEpochMs = this.now();
  }
}
