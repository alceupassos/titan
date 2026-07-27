// Utilitário mínimo de máquina de estados — zero I/O, puro. Usado por todas as máquinas de
// estado do domínio (reservation, payment, unit, fiscal-document, work-order, evidence).

export type Transitions<State extends string> = Readonly<Record<State, readonly State[]>>;

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Transição inválida: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

/** Retorna true se a transição from->to é permitida pela tabela. Função pura. */
export function canTransition<State extends string>(
  transitions: Transitions<State>,
  from: State,
  to: State,
): boolean {
  return transitions[from]?.includes(to) ?? false;
}

/** Aplica a transição ou lança InvalidTransitionError. Não muta nada — retorna o novo estado. */
export function transition<State extends string>(
  transitions: Transitions<State>,
  from: State,
  to: State,
): State {
  if (!canTransition(transitions, from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}
