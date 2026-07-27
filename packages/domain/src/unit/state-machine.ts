// I9 — Nenhuma unidade recebe check-in fora do estado `ready` (limpa e inspecionada). Exceção
// só por override nominal com motivo.
import { canTransition, transition, type Transitions } from "../fsm";

export type UnitStatus =
  | "ready"
  | "occupied"
  | "dirty"
  | "cleaning"
  | "clean"
  | "inspected"
  | "blocked"
  | "rework";

const UNIT_TRANSITIONS: Transitions<UnitStatus> = {
  ready: ["occupied", "blocked"],
  occupied: ["dirty", "blocked"],
  dirty: ["cleaning"],
  cleaning: ["clean"],
  clean: ["inspected", "rework", "ready"], // "ready" direto: fora da amostra de inspeção (9.8.5)
  inspected: ["ready"],
  rework: ["cleaning"],
  blocked: ["ready"], // só via override nominal — ver checkIn() abaixo, motivo é obrigatório
};

export function canTransitionUnit(from: UnitStatus, to: UnitStatus): boolean {
  return canTransition(UNIT_TRANSITIONS, from, to);
}

export function transitionUnit(from: UnitStatus, to: UnitStatus): UnitStatus {
  return transition(UNIT_TRANSITIONS, from, to);
}

export class CheckInBlockedError extends Error {
  constructor(public readonly unitStatus: UnitStatus) {
    super(
      `Check-in bloqueado: unidade está em '${unitStatus}', não 'ready'. ` +
        "I9 — nenhuma unidade recebe check-in fora do estado ready, exceto override nominal com motivo.",
    );
    this.name = "CheckInBlockedError";
  }
}

/**
 * I9 em função pura: só permite check-in se a unidade estiver `ready`, OU se um override
 * explícito com motivo não-vazio for fornecido (o override em si — quem autorizou, motivo — é
 * responsabilidade de quem chama; esta função só recusa o caminho silencioso).
 */
export function checkIn(unitStatus: UnitStatus, override?: { reason: string }): UnitStatus {
  if (unitStatus === "ready") {
    return transitionUnit("ready", "occupied");
  }
  if (override && override.reason.trim().length > 0) {
    return "occupied"; // override nominal registrado pelo chamador — não é o caminho silencioso
  }
  throw new CheckInBlockedError(unitStatus);
}
