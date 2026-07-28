// Funções puras de data usadas pela sincronização de canal (Fase 3, Passo 4c). Zero I/O —
// extraídas do repositório (`channel-sync-repo.ts`) de propósito, no mesmo espírito de
// `packages/domain` (zero I/O, testável sem Postgres): o parsing de `daterange` do Postgres e a
// geração de um intervalo de dias são lógica pura, então ganham teste próprio sem precisar de um
// banco vivo (Gap conhecido 2 de docs/fase-atual.md — Docker nem sempre está de pé nesta máquina).
import { civilDate, type CivilDate } from "@titan/dates";

/** `epoch ms` -> data civil UTC ("2026-07-28"). Injeta o instante de fora (nunca `Date.now()`
 * direto no meio da lógica) — mesmo padrão de `now()`/`idGenerator()` de `jobs/process-webhook.ts`. */
export function civilDateFromEpochMs(epochMs: number): CivilDate {
  return civilDate(new Date(epochMs).toISOString().slice(0, 10));
}

export function addDaysToCivilDate(date: CivilDate, days: number): CivilDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return civilDate(d.toISOString().slice(0, 10));
}

/** Lista de `numDays` datas civis consecutivas a partir de (e incluindo) `start`. */
export function civilDateRange(start: CivilDate, numDays: number): CivilDate[] {
  const days: CivilDate[] = [];
  for (let i = 0; i < numDays; i++) {
    days.push(addDaysToCivilDate(start, i));
  }
  return days;
}

export class InvalidPgDateRangeError extends Error {
  constructor(raw: string) {
    super(
      `Formato de daterange do Postgres inesperado: "${raw}". Esperado "[YYYY-MM-DD,YYYY-MM-DD)" ` +
        "(ver comentário sobre a coluna `stay` em packages/db/src/schema/reservation.ts).",
    );
    this.name = "InvalidPgDateRangeError";
  }
}

/**
 * Parseia o formato textual de `daterange` que o driver `pg`/drizzle devolve para a coluna
 * `reservations.stay` (customType, ver packages/db/src/schema/reservation.ts) — sempre
 * "[checkin,checkout)" nesta aplicação (I1: checkin inclusivo, checkout exclusivo), mas o parser
 * aceita qualquer combinação de colchete/parêntese nas bordas para não quebrar num caractere de
 * fronteira que a lib de range do Postgres decida usar.
 */
export function parsePgDateRange(raw: string): { checkin: CivilDate; checkout: CivilDate } {
  const match = /^[[(](\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})[)\]]$/.exec(raw);
  if (!match) {
    throw new InvalidPgDateRangeError(raw);
  }
  return { checkin: civilDate(match[1]!), checkout: civilDate(match[2]!) };
}
