// Fase 3 — uma mudança de disponibilidade a empurrar para um canal externo. iCal e a maioria dos
// calendários de OTA trabalham por dia (não por range livre), então o delta é sempre dia a dia —
// diferente de `Stay`, que representa um intervalo [checkin, checkout).
import type { CivilDate } from "@titan/dates";

export interface CalendarDelta {
  readonly unitId: string;
  readonly date: CivilDate;
  /** true = bloqueado/indisponível nesse dia; false = liberado. */
  readonly blocked: boolean;
}
