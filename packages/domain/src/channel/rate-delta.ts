// Fase 3 — uma mudança de tarifa por dia a empurrar para um canal externo. Mesmo raciocínio de
// granularidade diária de `calendar-delta.ts`.
import type { CivilDate } from "@titan/dates";
import type { Money } from "@titan/money";

export interface RateDelta {
  readonly unitId: string;
  readonly date: CivilDate;
  readonly priceAmount: Money;
}
