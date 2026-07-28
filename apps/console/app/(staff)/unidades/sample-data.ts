// Dados de amostra para a administração dos 4 studios (Studio 506/609/312/409) — mesmo padrão de
// apps/console/app/(staff)/pricing/sample-data.ts e .../estoque/sample-data.ts: sem Postgres vivo
// nesta máquina (Gap conhecido 2, docs/fase-atual.md) e sem colunas reais de área/capacidade/
// categoria em `units` (bounded context `inventory` ainda não modelado — mesmo gap documentado em
// pricing/sample-data.ts desde a Fase 8). Área/capacidade vivem só aqui, na camada de UI, como
// `UnitProfile` já faz para categoria/capacidade — nunca uma migration nova só para conteúdo demo.
//
// Mesmo "mundo" de amostra do resto do cockpit: `TENANT_ID` é o mesmo de
// apps/console/app/(staff)/estoque/sample-data.ts. Os 4 studios usam ids novos (sufixo = o
// próprio código da unidade, para ficar legível), nunca colidindo com os ids `...0001`-`...0005`
// já usados por outras rotas de amostra.
import type { CivilDate } from "@titan/dates";
import { civilDate } from "@titan/dates";
import type { Cents, Channel, OccupancyObservation, ReservationStatus, UnitProfile, UnitStatus } from "@titan/domain";

export const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00";

export interface StudioUnit {
  id: string;
  code: string;
  name: string;
  status: UnitStatus;
  areaSqm: number;
  maxCapacity: number;
  category: "studio";
  currentNightlyPriceCents: Cents;
}

// 4 studios pedidos: 506, 609, 312, 409 — 40m², capacidade máxima 6 pessoas. Status variado
// (ready/occupied/dirty/blocked) para exercitar os 4 tons de StatusPill na listagem.
export const STUDIO_506: StudioUnit = {
  id: "a0000000-0000-4000-8000-000000000506",
  code: "506",
  name: "Studio 506",
  status: "ready",
  areaSqm: 40,
  maxCapacity: 6,
  category: "studio",
  currentNightlyPriceCents: 32000,
};

export const STUDIO_609: StudioUnit = {
  id: "a0000000-0000-4000-8000-000000000609",
  code: "609",
  name: "Studio 609",
  status: "occupied",
  areaSqm: 40,
  maxCapacity: 6,
  category: "studio",
  currentNightlyPriceCents: 34500,
};

export const STUDIO_312: StudioUnit = {
  id: "a0000000-0000-4000-8000-000000000312",
  code: "312",
  name: "Studio 312",
  status: "dirty",
  areaSqm: 40,
  maxCapacity: 6,
  category: "studio",
  currentNightlyPriceCents: 29500,
};

export const STUDIO_409: StudioUnit = {
  id: "a0000000-0000-4000-8000-000000000409",
  code: "409",
  name: "Studio 409",
  status: "blocked",
  areaSqm: 40,
  maxCapacity: 6,
  category: "studio",
  currentNightlyPriceCents: 31000,
};

export const STUDIOS: readonly StudioUnit[] = [STUDIO_506, STUDIO_609, STUDIO_312, STUDIO_409];

function toUnitProfile(unit: StudioUnit): UnitProfile {
  return {
    unitId: unit.id,
    category: unit.category,
    capacity: unit.maxCapacity,
    currentNightlyPriceCents: unit.currentNightlyPriceCents,
  };
}

// Comparáveis de mercado — heurística de amostra por categoria/capacidade/preço (mesmo mecanismo
// de packages/domain/src/pricing/comp-set.ts::buildCompSet), NUNCA dado de scraping real
// (anti-padrão #10 — docs/anti-padroes.md — e ADR-0014, hierarquia de fontes: nível 1 apenas,
// sinais próprios). Rotulados como "mercado" para deixar claro que são fictícios.
export const SAMPLE_MARKET_COMPARABLES: UnitProfile[] = [
  { unitId: "b0000000-0000-4000-8000-000000000001", category: "studio", capacity: 6, currentNightlyPriceCents: 33500 },
  { unitId: "b0000000-0000-4000-8000-000000000002", category: "studio", capacity: 5, currentNightlyPriceCents: 30500 },
  { unitId: "b0000000-0000-4000-8000-000000000003", category: "studio", capacity: 6, currentNightlyPriceCents: 36000 },
  { unitId: "b0000000-0000-4000-8000-000000000004", category: "studio", capacity: 4, currentNightlyPriceCents: 27500 },
  { unitId: "b0000000-0000-4000-8000-000000000005", category: "apartamento", capacity: 6, currentNightlyPriceCents: 42000 },
];

/** Todos os candidatos de comp set para uma unidade-alvo: os OUTROS 3 studios da carteira +
 * o mercado de amostra — nunca a própria unidade-alvo (buildCompSet já filtra por unitId, mas
 * ficar explícito aqui documenta a intenção). */
export function marketCandidatesFor(targetUnit: StudioUnit): UnitProfile[] {
  return [
    ...STUDIOS.filter((unit) => unit.id !== targetUnit.id).map(toUnitProfile),
    ...SAMPLE_MARKET_COMPARABLES,
  ];
}

const MARKET_LABEL_BY_ID: Record<string, string> = {
  [SAMPLE_MARKET_COMPARABLES[0]!.unitId]: "Studio mercado A",
  [SAMPLE_MARKET_COMPARABLES[1]!.unitId]: "Studio mercado B",
  [SAMPLE_MARKET_COMPARABLES[2]!.unitId]: "Studio mercado C",
  [SAMPLE_MARKET_COMPARABLES[3]!.unitId]: "Studio mercado D",
  [SAMPLE_MARKET_COMPARABLES[4]!.unitId]: "Apartamento mercado E",
};

/** Rótulo amigável para qualquer unitId do comp set — carteira própria (código real) ou
 * comparável de mercado (letra de amostra). Usado só na exibição do `ComparisonBarChart`. */
export function labelForUnitId(unitId: string): string {
  const ownUnit = STUDIOS.find((unit) => unit.id === unitId);
  if (ownUnit) return ownUnit.name;
  return MARKET_LABEL_BY_ID[unitId] ?? unitId;
}

const ANCHOR_DATE = "2026-08-01"; // sábado — mesma âncora de pricing/sample-data.ts

/** 12 semanas de histórico de ocupação sintético por unidade — determinístico via índice +
 * `seedOffset` (nunca `Math.random()`), mesmo padrão de pricing/sample-data.ts. `seedOffset`
 * varia a taxa de ocupação de fim de semana/dia útil entre unidades, para os 4 studios não
 * renderizarem sparklines idênticos. */
export function buildOccupancyHistory(seedOffset: number): OccupancyObservation[] {
  return Array.from({ length: 84 }, (_, i) => {
    const daysAgo = 84 - i;
    const date = new Date(`${ANCHOR_DATE}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - daysAgo);
    const iso = date.toISOString().slice(0, 10);
    const dow = date.getUTCDay();
    const isWeekend = dow === 5 || dow === 6;
    const cycle = (i + seedOffset) % 9;
    const occupied = isWeekend ? cycle !== 0 : cycle < 4;
    return { date: civilDate(iso), occupied };
  });
}

export const SAMPLE_TARGET_DATE: CivilDate = civilDate("2026-08-01");

/** Custo variável de amostra por unidade — mesma disciplina de pricing/sample-data.ts (comissão
 * de canal/taxa de gateway seguem provisionadas a zero, dívida técnica das Fases 2/3, nunca um
 * valor inventado). */
export function buildVariableCostInputs(
  seedOffset: number,
) {
  // `seedOffset` chega como o código de 3 dígitos da unidade (506/609/312/409) — reduzido a um
  // dígito (0-9) antes de escalar o custo, para não inflar o piso muito acima do teto de preço
  // (achado real: sem este `% 10`, seedOffset=506 produzia um piso de custo variável 2-3x maior
  // que o preço da própria unidade, e `optimizeNightlyPriceCents` rejeitava com
  // `InvalidPriceRangeError` — encontrado só ao verificar a página ao vivo no VPS).
  const smallSeed = seedOffset % 10;
  return {
    cleaningCostCents: 9000 + smallSeed * 200,
    linenReplenishmentCostCents: 1600,
    channelCommissionBasisPoints: 0,
    gatewayRateBasisPoints: 0,
  };
}

export const SAMPLE_MINIMUM_MARGIN_BASIS_POINTS = 2000; // 20%

/** Backtest sintético (30 noites) por unidade — mesmo espírito de pricing/sample-data.ts,
 * variando levemente por `seedOffset` para o ΔRevPAR não ser idêntico entre os 4 studios. */
export function buildBacktestNights(seedOffset: number) {
  const smallSeed = seedOffset % 10; // mesmo motivo do `% 10` em buildVariableCostInputs acima.
  const fixed = 27000 + smallSeed * 300;
  const suggestedLow = 18000 + smallSeed * 200;
  const suggestedHigh = fixed + 3000;
  return [
    ...Array.from({ length: 12 }, () => ({
      date: civilDate("2026-06-01"),
      fixedPriceCents: fixed,
      suggestedPriceCents: suggestedLow,
      simulatedOccupiedAtFixedPrice: false,
      simulatedOccupiedAtSuggestedPrice: true,
    })),
    ...Array.from({ length: 12 }, () => ({
      date: civilDate("2026-06-02"),
      fixedPriceCents: fixed,
      suggestedPriceCents: suggestedHigh,
      simulatedOccupiedAtFixedPrice: true,
      simulatedOccupiedAtSuggestedPrice: true,
    })),
    ...Array.from({ length: 6 }, () => ({
      date: civilDate("2026-06-03"),
      fixedPriceCents: fixed - 4000,
      suggestedPriceCents: fixed - 4000,
      simulatedOccupiedAtFixedPrice: true,
      simulatedOccupiedAtSuggestedPrice: true,
    })),
  ];
}

export interface SampleReservation {
  id: string;
  guestName: string;
  channel: Channel;
  status: ReservationStatus;
  checkin: CivilDate;
  checkout: CivilDate;
  guestCount: number;
  totalCents: Cents;
}

const GUEST_NAMES = [
  "Marina Alves",
  "Thiago Ferreira",
  "Camila Souza",
  "Rodrigo Lima",
  "Beatriz Nunes",
  "Felipe Cardoso",
];
const CHANNELS: Channel[] = ["direct", "airbnb", "booking", "vrbo", "expedia"];
const STATUSES: ReservationStatus[] = ["confirmed", "confirmed", "confirmed", "pending", "cancelled"];

/** Reservas recentes/futuras de amostra — determinístico por índice, nunca `Math.random()`.
 * Datas em torno de `SAMPLE_TARGET_DATE` (algumas já concluídas, algumas futuras). */
export function buildRecentReservations(unit: StudioUnit, seedOffset: number): SampleReservation[] {
  return Array.from({ length: 5 }, (_, i) => {
    const offsetDays = (i - 2) * 6 + (seedOffset % 3);
    const checkinDate = new Date("2026-08-01T00:00:00Z");
    checkinDate.setUTCDate(checkinDate.getUTCDate() + offsetDays);
    const checkoutDate = new Date(checkinDate);
    checkoutDate.setUTCDate(checkoutDate.getUTCDate() + 2 + (i % 3));

    const nights = 2 + (i % 3);
    return {
      id: `${unit.id}-res-${i}`,
      guestName: GUEST_NAMES[(i + seedOffset) % GUEST_NAMES.length] as string,
      channel: CHANNELS[(i + seedOffset) % CHANNELS.length] as Channel,
      status: STATUSES[(i + seedOffset) % STATUSES.length] as ReservationStatus,
      checkin: civilDate(checkinDate.toISOString().slice(0, 10)),
      checkout: civilDate(checkoutDate.toISOString().slice(0, 10)),
      guestCount: 2 + (i % (unit.maxCapacity - 1)),
      totalCents: unit.currentNightlyPriceCents * nights,
    };
  });
}
