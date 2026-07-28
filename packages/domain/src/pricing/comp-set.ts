// Estágio 1 do pipeline da seção 9.7 do prompt único ("Comp Set"). Redução de escopo deliberada
// (docs/roadmap.md, Fase 8): sem PostGIS/infra geoespacial nesta sessão, o comp set aqui é uma
// heurística de similaridade por ATRIBUTOS CADASTRAIS (categoria + capacidade + faixa de tarifa
// atual), explicitamente NÃO a similaridade geográfica real (KNN sobre lat/lng) prevista na
// especificação completa — fica para quando a unidade ganhar coordenadas reais (bounded context
// `inventory`, ainda não modelado). Zero I/O.
import type { Cents } from "../ledger/ledger-entry";

export interface UnitProfile {
  readonly unitId: string;
  readonly category: string;
  readonly capacity: number;
  readonly currentNightlyPriceCents: Cents;
}

export interface CompSetMember {
  readonly unitId: string;
  /** 0 a 1 — 1 é idêntico, 0 é totalmente diferente. */
  readonly similarityScore: number;
}

export class InvalidCompSetInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCompSetInputError";
  }
}

/** Distância normalizada de capacidade — 0 quando igual, tende a 1 quanto maior a diferença
 * relativa. Evita capacidade zero como divisor. */
function capacityDistance(a: UnitProfile, b: UnitProfile): number {
  const maxCapacity = Math.max(a.capacity, b.capacity, 1);
  return Math.abs(a.capacity - b.capacity) / maxCapacity;
}

/** Distância normalizada de preço atual — mesmo espírito de `capacityDistance`, usada como sinal
 * secundário de "unidades no mesmo patamar de mercado" na ausência de geo real. */
function rateDistance(a: UnitProfile, b: UnitProfile): number {
  const maxPrice = Math.max(a.currentNightlyPriceCents, b.currentNightlyPriceCents, 1);
  return Math.abs(a.currentNightlyPriceCents - b.currentNightlyPriceCents) / maxPrice;
}

/**
 * Constrói o comp set do `target` a partir de `candidates` — heurística: categoria igual pesa
 * mais que capacidade/preço próximos, nunca o contrário (duas unidades de categorias diferentes
 * nunca são consideradas mais similares que duas da mesma categoria com capacidade distinta).
 * Retorna até `maxSize` membros ordenados por `similarityScore` decrescente. Candidatos da mesma
 * unidade do `target` são ignorados. Retorna array vazio (nunca lança) quando não há candidatos
 * elegíveis — a decisão de como lidar com "sem comp set" é do chamador (ex.: usar só o piso de
 * custo variável, sem âncora de mercado).
 */
export function buildCompSet(
  target: UnitProfile,
  candidates: readonly UnitProfile[],
  maxSize: number,
): CompSetMember[] {
  if (maxSize <= 0) {
    throw new InvalidCompSetInputError(`maxSize deve ser positivo (recebido ${maxSize}).`);
  }

  const scored = candidates
    .filter((candidate) => candidate.unitId !== target.unitId)
    .map((candidate) => {
      const categoryPenalty = candidate.category === target.category ? 0 : 0.5;
      const distance =
        categoryPenalty + 0.35 * capacityDistance(target, candidate) + 0.15 * rateDistance(target, candidate);
      const similarityScore = Math.max(0, 1 - distance);
      return { unitId: candidate.unitId, similarityScore };
    })
    // `Array.prototype.sort` é estável (garantido pela spec desde ES2019, V8/Node inclusos) —
    // empate exato de `similarityScore` preserva a ordem de entrada em `candidates`, nunca ordem
    // arbitrária a cada execução.
    .sort((a, b) => b.similarityScore - a.similarityScore);

  return scored.slice(0, maxSize);
}

/** Preço mediano do comp set — usado como âncora de mercado (estágio 2, "Base Price", quando não
 * há regressão hedônica real disponível nesta fase). Retorna `null` para comp set vazio — nunca
 * inventa uma âncora quando não há nenhum comparável. */
export function medianCompSetPriceCents(
  members: readonly CompSetMember[],
  profilesById: ReadonlyMap<string, UnitProfile>,
): Cents | null {
  const prices = members
    .map((member) => profilesById.get(member.unitId)?.currentNightlyPriceCents)
    .filter((price): price is Cents => price !== undefined)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return null;
  }

  const mid = Math.floor(prices.length / 2);
  if (prices.length % 2 === 1) {
    return prices[mid]!;
  }
  return Math.round((prices[mid - 1]! + prices[mid]!) / 2);
}
