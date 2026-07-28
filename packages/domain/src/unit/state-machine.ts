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

export class DoubleCheckInError extends Error {
  constructor() {
    super("Check-in bloqueado: unidade já está 'occupied' — não se faz check-in duas vezes, mesmo com override.");
    this.name = "DoubleCheckInError";
  }
}

/** Override nominal — "nominal" exige um NOME (quem autorizou), não só um motivo em texto
 * (achado FALHA-H da auditoria de invariantes de F0: a versão anterior só pedia `reason`, sem
 * capturar nenhum ator). */
export interface CheckInOverride {
  reason: string;
  authorizedBy: string;
}

/**
 * I9 em função pura: só permite check-in se a unidade estiver `ready`, OU se um override
 * explícito e nominal (motivo + quem autorizou) for fornecido. Nunca permite check-in numa
 * unidade já `occupied` — nem o override contorna check-in duplicado, que é um erro de operação
 * diferente de I9 (a unidade não está "não-ready", ela já tem hóspede dentro).
 */
export function checkIn(unitStatus: UnitStatus, override?: CheckInOverride): UnitStatus {
  if (unitStatus === "occupied") {
    throw new DoubleCheckInError();
  }
  if (unitStatus === "ready") {
    return transitionUnit("ready", "occupied");
  }
  if (override && override.reason.trim().length > 0 && override.authorizedBy.trim().length > 0) {
    // Override nominal registrado pelo chamador — "occupied" aqui é o único destino possível de
    // um check-in, exatamente como no caminho normal; não é um transitionUnit da tabela porque a
    // tabela intencionalmente não permite esses estados de origem (é a exceção, não a regra).
    return "occupied";
  }
  throw new CheckInBlockedError(unitStatus);
}
