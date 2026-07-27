// Eventos de domínio — I5: toda mutação de disponibilidade/tarifa (e, por extensão, de estado
// de agregado) é evento versionado e reproduzível. Puro: só descreve o evento, não o persiste
// (outbox/event log ficam em packages/db).

export interface DomainEvent<Kind extends string, Payload> {
  readonly kind: Kind;
  readonly version: 1;
  readonly occurredAtCivilInstant: string; // ISO — carimbo lógico do evento, não I/O
  readonly payload: Payload;
}

export function domainEvent<Kind extends string, Payload>(
  kind: Kind,
  payload: Payload,
  occurredAtCivilInstant: string,
): DomainEvent<Kind, Payload> {
  return { kind, version: 1, occurredAtCivilInstant, payload };
}
