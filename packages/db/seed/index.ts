// Script de seed de demonstração — Fase 1, Passo 3b do plano aprovado (docs/fase-atual.md).
// Povoa um tenant de demo com unidades, planos de tarifa e reservas realistas para o cockpit.
//
// Execução: `pnpm --filter @titan/db run seed` (ou `tsx seed/index.ts` dentro de packages/db),
// com a infra local de `infra/docker-compose.yml` no ar (Postgres + PgBouncer).
//
// Duas conexões distintas, de propósito (mesma distinção já usada em drizzle.config.ts):
//   - Conexão ADMIN (`titan`, superusuário, DATABASE_ADMIN_URL) — só para o tenant e o usuário
//     administrativo. É a ÚNICA forma de criar o primeiro tenant: a policy RLS de `tenants`
//     (packages/db/migrations/0001_app_role_grants_and_rls.sql) exige
//     `id = current_setting('app.tenant_id')::uuid` até para INSERT (sem WITH CHECK explícito,
//     o Postgres usa a mesma expressão do USING como WITH CHECK) — ou seja, não dá pra criar um
//     tenant através de `withTenant()`, que já pressupõe um tenantId existente. Só um
//     superusuário (que ignora RLS mesmo com FORCE ROW LEVEL SECURITY) resolve esse
//     ovo-e-galinha.
//   - `withTenant()` (`titan_app`, não-superusuário, DATABASE_URL/PgBouncer) — para tudo que já
//     depende do tenant existir: units, rate_plans, reservations.
//
// Cálculo de preço: `reservations.priceCents` é replicado inline (nightlyPriceCents × noites) em
// vez de importar `priceStay` de `@titan/domain` — decisão explícita para não adicionar
// dependências novas a `packages/db/package.json` nesta faixa (duas outras faixas mexem em
// `packages/db/test/` e em `packages/ui`/`apps/console` em paralelo; `@titan/domain`,
// `@titan/money` e `@titan/dates` não são dependências atuais deste pacote, e adicioná-las
// exigiria `pnpm install`, o que tocaria o lockfile raiz). A conta replicada é a mesma de
// `packages/domain/src/rate-plan/rate-plan.ts` (`priceStay`): diária inteira em centavos ×
// número de noites — sem estadia abaixo do mínimo (garantido na geração, ver abaixo).
//
// Geração determinística (sem `Math.random()`): todo índice deriva de loops `for`, não de
// sorteio — mesma execução sempre produz os mesmos dados. Idempotência NÃO é garantida — rodar
// o script duas vezes cria um segundo tenant "Titan Demo" com dados duplicados; isto é um script
// de seed local, não uma migration.
//
// I1 (EXCLUDE USING gist — reservations_no_overlap): cada unidade recebe uma cadeia SEQUENCIAL
// de reservas — toda reserva nova começa depois que a anterior da MESMA unidade termina (mais um
// gap de 0 a 3 dias), qualquer que seja o status. Isso torna a não-sobreposição verdadeira para
// TODOS os status, não só para pending/confirmed (a constraint real só cobre pending/confirmed,
// então cancelled/no_show poderiam se sobrepor à vontade) — mais forte do que a constraint
// exige, mas elimina de vez o risco de violar I1 neste script.

import pg from "pg";
import { withTenant, units, ratePlans, reservations, closePool } from "../src/index";

const ADMIN_DATABASE_URL =
  process.env.DATABASE_ADMIN_URL ?? "postgresql://titan:titan_dev_only@localhost:5432/titan_dev";

const SEED_ACTOR_ID = "seed-script";
const TENANT_NAME = "Titan Demo";
const ADMIN_USER_EMAIL = "admin@titandemo.com.br";

type UnitStatusSeed = "ready" | "dirty" | "blocked";

interface UnitSeed {
  readonly name: string;
  readonly status: UnitStatusSeed;
}

// 8 unidades — nomes realistas de acomodação de temporada, status variado (I9:
// packages/domain/src/unit/state-machine.ts define os nomes de estado válidos).
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

// Preço-base por diária, em CENTAVOS inteiros — um valor por unidade, mesma ordem de UNIT_SEEDS.
const BASE_NIGHTLY_PRICE_CENTS: readonly number[] = [
  35000, 32000, 42000, 40000, 65000, 38000, 55000, 45000,
];

// min_stay_nights cicla 0/2/3 por índice de unidade — cobre os três casos pedidos na tarefa.
const MIN_STAY_CYCLE: readonly number[] = [0, 2, 3];

// Janela de vigência dos planos de tarifa: ~6 meses fixos a partir de uma data determinística
// (não `new Date()`/`Date.now()` — determinismo não é crítico para um seed local, mas não custa
// nada manter).
const RATE_PLAN_VALID_FROM = "2026-08-01";
const RATE_PLAN_VALID_TO = "2027-02-01";

// Janela de reservas: os ~2 meses seguintes ao início da vigência das tarifas.
const RESERVATION_BASE_DATE = "2026-08-01";

const CHANNELS = ["direct", "airbnb", "booking", "vrbo", "expedia"] as const;
const STATUS_CYCLE = ["confirmed", "pending", "confirmed", "cancelled", "confirmed", "pending"] as const;
const NIGHTS_CYCLE = [2, 3, 4, 5] as const;
const GAP_CYCLE = [0, 1, 2, 3] as const;
const RESERVATIONS_PER_UNIT = 4;

/** Soma dias (inteiros, sem hora/fuso) a uma data civil "YYYY-MM-DD" — aritmética em UTC só para
 * não sofrer de bug de fuso horário local do processo que roda o script; a data resultante
 * continua sendo tratada como civil pura, nunca como instante. */
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Literal de `daterange` do Postgres no formato aceito pela coluna `stay` (customType em
 * packages/db/src/schema/reservation.ts) — checkout exclusivo, igual à semântica de `Stay` em
 * @titan/dates. */
function daterangeLiteral(checkinISO: string, checkoutISO: string): string {
  return `[${checkinISO},${checkoutISO})`;
}

async function insertTenantAndAdminUser(): Promise<{ tenantId: string; userId: string }> {
  const adminClient = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await adminClient.connect();
  try {
    const tenantResult = await adminClient.query<{ id: string }>(
      "INSERT INTO tenants (name) VALUES ($1) RETURNING id",
      [TENANT_NAME],
    );
    const tenantId = tenantResult.rows[0]?.id;
    if (!tenantId) {
      throw new Error("Falha ao inserir tenant de demo — INSERT não retornou id.");
    }

    const userResult = await adminClient.query<{ id: string }>(
      "INSERT INTO users (tenant_id, email) VALUES ($1, $2) RETURNING id",
      [tenantId, ADMIN_USER_EMAIL],
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) {
      throw new Error("Falha ao inserir usuário administrativo de demo — INSERT não retornou id.");
    }

    return { tenantId, userId };
  } finally {
    await adminClient.end();
  }
}

async function main(): Promise<void> {
  const { tenantId, userId } = await insertTenantAndAdminUser();

  let unitCount = 0;
  let ratePlanCount = 0;
  let reservationCount = 0;

  await withTenant({ tenantId, actorId: SEED_ACTOR_ID }, async (db) => {
    for (let ui = 0; ui < UNIT_SEEDS.length; ui++) {
      const unitSeed = UNIT_SEEDS[ui]!;
      const baseNightlyPriceCents = BASE_NIGHTLY_PRICE_CENTS[ui]!;
      const minStayNights = MIN_STAY_CYCLE[ui % MIN_STAY_CYCLE.length]!;

      const [unitRow] = await db
        .insert(units)
        .values({ tenantId, name: unitSeed.name, status: unitSeed.status })
        .returning();
      if (!unitRow) {
        throw new Error(`Falha ao inserir unidade "${unitSeed.name}".`);
      }
      unitCount++;

      // Plano de tarifa "padrão" — sempre o primeiro inserido, é o único usado para precificar
      // as reservas desta unidade (ver nota de cálculo de preço no topo do arquivo).
      const [primaryRatePlanRow] = await db
        .insert(ratePlans)
        .values({
          tenantId,
          unitId: unitRow.id,
          name: "Tarifa Padrão",
          nightlyPriceCents: baseNightlyPriceCents,
          currency: "BRL",
          minStayNights,
          validFrom: RATE_PLAN_VALID_FROM,
          validTo: RATE_PLAN_VALID_TO,
        })
        .returning();
      if (!primaryRatePlanRow) {
        throw new Error(`Falha ao inserir plano de tarifa padrão de "${unitSeed.name}".`);
      }
      ratePlanCount++;

      // Metade das unidades (índice par) ganha um segundo plano promocional — cobre o "1-2
      // rate_plans por unidade" pedido na tarefa. Não é usado para precificar reservas (a regra
      // documentada no topo usa sempre o plano padrão), só para a tabela não ficar 1-para-1.
      if (ui % 2 === 0) {
        await db.insert(ratePlans).values({
          tenantId,
          unitId: unitRow.id,
          name: "Tarifa Promocional",
          nightlyPriceCents: Math.round(baseNightlyPriceCents * 0.85),
          currency: "BRL",
          minStayNights: 0,
          validFrom: RATE_PLAN_VALID_FROM,
          validTo: RATE_PLAN_VALID_TO,
        });
        ratePlanCount++;
      }

      // Cadeia sequencial de reservas desta unidade — nunca sobrepõe (ver nota de I1 no topo).
      let cursorISO = addDaysISO(RESERVATION_BASE_DATE, ui * 4);
      for (let ri = 0; ri < RESERVATIONS_PER_UNIT; ri++) {
        const cycleIndex = ui + ri;

        let nights: number = NIGHTS_CYCLE[cycleIndex % NIGHTS_CYCLE.length]!;
        if (nights < primaryRatePlanRow.minStayNights) {
          nights = primaryRatePlanRow.minStayNights;
        }

        const checkinISO = cursorISO;
        const checkoutISO = addDaysISO(checkinISO, nights);
        const gap = GAP_CYCLE[cycleIndex % GAP_CYCLE.length]!;
        cursorISO = addDaysISO(checkoutISO, gap);

        const channel = CHANNELS[cycleIndex % CHANNELS.length]!;
        const status = STATUS_CYCLE[cycleIndex % STATUS_CYCLE.length]!;
        const priceCents = baseNightlyPriceCents * nights;

        await db.insert(reservations).values({
          tenantId,
          unitId: unitRow.id,
          stay: daterangeLiteral(checkinISO, checkoutISO),
          status,
          channel,
          externalRef: channel === "direct" ? null : `${channel}-EXT-${ui}-${ri}`,
          priceCents,
          currency: "BRL",
        });
        reservationCount++;
      }
    }
  });

  console.log("Seed de demonstração concluído:");
  console.log(`  tenants:      1 ("${TENANT_NAME}", id=${tenantId})`);
  console.log(`  users:        1 (admin, id=${userId})`);
  console.log(`  units:        ${unitCount}`);
  console.log(`  rate_plans:   ${ratePlanCount}`);
  console.log(`  reservations: ${reservationCount}`);
}

main()
  .then(() => closePool())
  .catch(async (err: unknown) => {
    console.error("Seed falhou:", err);
    process.exitCode = 1;
    await closePool();
  });
