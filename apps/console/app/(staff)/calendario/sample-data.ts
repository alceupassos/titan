// Dados de amostra para o preview do tape chart (Passo 4 da Fase 1) — NÃO há Postgres vivo nesta
// máquina (Docker Desktop parado, ver docs/fase-atual.md "Gap conhecido 2"), então esta rota não
// pode consultar `packages/db`. Em vez de inventar linhas à mão, este arquivo REPLICA o mesmo
// algoritmo determinístico de `packages/db/seed/index.ts` (mesmos nomes de unidade, mesmos preços
// por diária, mesmos ciclos de canal/status/noites/gap) — só sem nenhuma chamada de I/O — para
// que o preview mostre exatamente a "forma" dos dados que existiriam no banco depois do seed real.
// Quando F1 ligar `availability`/reservas reais, este arquivo é descartado e a page passa a buscar
// via Server Component/Server Action.
import { money } from "@titan/money";
import type { TapeChartChannel, TapeChartReservation, TapeChartReservationStatus, TapeChartUnit } from "@titan/ui";

type UnitStatusSeed = "ready" | "dirty" | "blocked";

interface UnitSeed {
  readonly name: string;
  readonly status: UnitStatusSeed;
}

// Mesmas 8 unidades de packages/db/seed/index.ts (nome + ordem).
const UNIT_SEEDS: readonly UnitSeed[] = [
  { name: "Studio Vista Mar 101", status: "ready" },
  { name: "Studio Vista Mar 102", status: "ready" },
  { name: "Apartamento Jardins 201", status: "dirty" },
  { name: "Apartamento Jardins 202", status: "ready" },
  { name: "Cobertura Duplex 301", status: "blocked" },
  { name: "Loft Centro 401", status: "ready" },
  { name: "Casa de Praia Enseada", status: "ready" },
  { name: "Flat Business 501", status: "dirty" },
];

// Mesmo preço-base por diária (centavos), mesma ordem de UNIT_SEEDS.
const BASE_NIGHTLY_PRICE_CENTS: readonly number[] = [35000, 32000, 42000, 40000, 65000, 38000, 55000, 45000];

const MIN_STAY_CYCLE: readonly number[] = [0, 2, 3];
const RESERVATION_BASE_DATE = "2026-08-01";
const CHANNELS: readonly TapeChartChannel[] = ["direct", "airbnb", "booking", "vrbo", "expedia"];
const STATUS_CYCLE: readonly TapeChartReservationStatus[] = [
  "confirmed",
  "pending",
  "confirmed",
  "cancelled",
  "confirmed",
  "pending",
];
const NIGHTS_CYCLE: readonly number[] = [2, 3, 4, 5];
const GAP_CYCLE: readonly number[] = [0, 1, 2, 3];
const RESERVATIONS_PER_UNIT = 4;

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export interface SampleTapeChartData {
  units: TapeChartUnit[];
  reservations: TapeChartReservation[];
}

/** Gera o mesmo conjunto de dados do seed real, em memória — determinístico (sem Math.random()),
 * mesma regra de I1 do comentário original: cadeia sequencial por unidade, nunca sobrepõe. */
export function buildSampleTapeChartData(): SampleTapeChartData {
  const units: TapeChartUnit[] = [];
  const reservations: TapeChartReservation[] = [];

  for (let ui = 0; ui < UNIT_SEEDS.length; ui++) {
    const unitSeed = UNIT_SEEDS[ui]!;
    const unitId = `unit-${ui}-${slugify(unitSeed.name)}`;
    units.push({ id: unitId, name: unitSeed.name });

    const baseNightlyPriceCents = BASE_NIGHTLY_PRICE_CENTS[ui]!;
    const minStayNights = MIN_STAY_CYCLE[ui % MIN_STAY_CYCLE.length]!;

    let cursorISO = addDaysISO(RESERVATION_BASE_DATE, ui * 4);
    for (let ri = 0; ri < RESERVATIONS_PER_UNIT; ri++) {
      const cycleIndex = ui + ri;

      let nights = NIGHTS_CYCLE[cycleIndex % NIGHTS_CYCLE.length]!;
      if (nights < minStayNights) nights = minStayNights;

      const checkinISO = cursorISO;
      const checkoutISO = addDaysISO(checkinISO, nights);
      const gap = GAP_CYCLE[cycleIndex % GAP_CYCLE.length]!;
      cursorISO = addDaysISO(checkoutISO, gap);

      const channel = CHANNELS[cycleIndex % CHANNELS.length]!;
      const status = STATUS_CYCLE[cycleIndex % STATUS_CYCLE.length]!;
      const priceCents = baseNightlyPriceCents * nights;

      reservations.push({
        id: `${unitId}-r${ri}`,
        unitId,
        checkinISO,
        checkoutISO,
        status,
        channel,
        price: money(priceCents, "BRL"),
      });
    }
  }

  return { units, reservations };
}
