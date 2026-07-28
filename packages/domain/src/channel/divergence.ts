// Fase 3 — resultado da reconciliação entre o estado local (fonte de verdade do Titan) e o
// estado que o canal externo reporta. Uma `Divergence` nunca é corrigida automaticamente aqui —
// este pacote é zero I/O; a decisão de como resolver (reenviar, alertar, bloquear canal) é do
// adapter/serviço que consome esta lista (fora de escopo desta tarefa).
import type { CivilDate } from "@titan/dates";
import type { Channel } from "../reservation/state-machine";

export type DivergenceKind = "availability_mismatch" | "rate_mismatch" | "unmapped_reservation";

export interface Divergence {
  readonly unitId: string;
  readonly channel: Channel;
  readonly kind: DivergenceKind;
  readonly date?: CivilDate;
  readonly detail: Readonly<Record<string, unknown>>;
  /** epoch ms — injetado pelo chamador, nunca `Date.now()` dentro do domínio. */
  readonly detectedAtEpochMs: number;
}
