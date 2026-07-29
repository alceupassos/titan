// Dados de amostra para o quadro do dia de limpeza (Fase 6, Passo 4b — docs/fase-atual.md). NÃO
// há Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2"), então a página
// (./page.tsx) não consulta `packages/db` para LER — mesmo espírito de
// apps/console/app/(staff)/distribuicao/sample-data.ts. Os tipos aqui são os MESMOS tipos de
// linha crua do Drizzle (`typeof units.$inferSelect`, `typeof cleaningTasks.$inferSelect`,
// `typeof reservations.$inferSelect`), não uma interface solta reinventada, para que trocar por
// uma query real (`withTenant(...).select().from(units).innerJoin(cleaningTasks, ...)`) seja só
// trocar a fonte, nunca o formato consumido pela lógica de derivação em ./page.tsx.
//
// O CAMINHO DE ESCRITA (`assignCleaningTaskAction`, `reassignCleaningTaskAction` — ./actions.ts)
// é real, contra o banco via `withTenant` — chamar qualquer uma a partir desta amostra tenta o
// Postgres de verdade e, sem Docker rodando, falha com erro de conexão (mesmo comportamento hoje
// de apps/console/app/(staff)/reservas/nova). Os ids abaixo são UUIDs v4 válidos por isso mesmo.
//
// Determinístico de propósito (sem `Date.now()`) — mesma âncora de tempo de
// apps/console/app/(staff)/distribuicao/sample-data.ts, para o preview renderizar sempre igual.
import type { cleaningTasks, reservations, units } from "@titan/db";

const TENANT_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00"; // mesmo tenant de amostra das demais rotas.

export const UNIT_STUDIO = "a0000000-0000-4000-8000-000000000001"; // Studio Vista Mar 101
export const UNIT_JARDINS = "a0000000-0000-4000-8000-000000000002"; // Apartamento Jardins 202
export const UNIT_LOFT = "a0000000-0000-4000-8000-000000000003"; // Loft Centro 401
export const UNIT_CASA = "a0000000-0000-4000-8000-000000000004"; // Casa de Praia Enseada
export const UNIT_VILA = "a0000000-0000-4000-8000-000000000005"; // Vila Enseada 12

export const CHECKLIST_TEMPLATE_ID = "f0000000-0000-4000-8000-000000000001";

// Mesma âncora de "agora" usada em apps/console/app/(staff)/distribuicao/sample-data.ts, para os
// dois painéis renderizarem com o mesmo relógio de amostra.
export const NOW_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T14:00:00Z");
const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

type UnitRow = typeof units.$inferSelect;
type CleaningTaskRow = typeof cleaningTasks.$inferSelect;
type ReservationRow = typeof reservations.$inferSelect;

// As 5 unidades relevantes para o quadro do dia (dirty/cleaning/clean/inspected/rework — I9,
// packages/domain/src/unit/state-machine.ts). Unidades em "ready"/"occupied"/"blocked" não
// aparecem aqui por não terem virada em andamento.
export const SAMPLE_UNITS: readonly UnitRow[] = [
  {
    id: UNIT_STUDIO,
    tenantId: TENANT_ID,
    name: "Studio Vista Mar 101",
    status: "dirty",
    areaSqm: null,
    maxCapacity: null,
    category: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 200 * 24 * HOUR_MS),
  },
  {
    id: UNIT_JARDINS,
    tenantId: TENANT_ID,
    name: "Apartamento Jardins 202",
    status: "cleaning",
    areaSqm: null,
    maxCapacity: null,
    category: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 180 * 24 * HOUR_MS),
  },
  {
    id: UNIT_LOFT,
    tenantId: TENANT_ID,
    name: "Loft Centro 401",
    status: "clean",
    areaSqm: null,
    maxCapacity: null,
    category: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 160 * 24 * HOUR_MS),
  },
  {
    id: UNIT_CASA,
    tenantId: TENANT_ID,
    name: "Casa de Praia Enseada",
    status: "inspected",
    areaSqm: null,
    maxCapacity: null,
    category: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 140 * 24 * HOUR_MS),
  },
  {
    id: UNIT_VILA,
    tenantId: TENANT_ID,
    name: "Vila Enseada 12",
    status: "rework",
    areaSqm: null,
    maxCapacity: null,
    category: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 120 * 24 * HOUR_MS),
  },
];

// Studio (dirty) NÃO tem cleaning_task ainda — é o caso que demonstra o formulário de
// "iniciar virada" (assignCleaningTaskAction) no quadro.
export const SAMPLE_CLEANING_TASKS: readonly CleaningTaskRow[] = [
  {
    id: "b0000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    checklistTemplateId: CHECKLIST_TEMPLATE_ID,
    checklistTemplateVersion: 3,
    assignedTo: "Marta Silva",
    status: "cleaning",
    startedAt: new Date(NOW_ANCHOR_EPOCH_MS - 90 * MINUTE_MS),
    completedAt: null,
    scorePercent: null,
    passed: null,
  },
  {
    id: "b0000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    checklistTemplateId: CHECKLIST_TEMPLATE_ID,
    checklistTemplateVersion: 3,
    assignedTo: "Carlos Souza",
    status: "clean",
    startedAt: new Date(NOW_ANCHOR_EPOCH_MS - 3 * HOUR_MS),
    completedAt: new Date(NOW_ANCHOR_EPOCH_MS - 20 * MINUTE_MS),
    scorePercent: 92,
    passed: true,
  },
  {
    id: "b0000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    unitId: UNIT_CASA,
    checklistTemplateId: CHECKLIST_TEMPLATE_ID,
    checklistTemplateVersion: 2,
    assignedTo: "Marta Silva",
    status: "inspected",
    startedAt: new Date(NOW_ANCHOR_EPOCH_MS - 26 * HOUR_MS),
    completedAt: new Date(NOW_ANCHOR_EPOCH_MS - 22 * HOUR_MS),
    scorePercent: 96,
    passed: true,
  },
  {
    id: "b0000000-0000-4000-8000-000000000005",
    tenantId: TENANT_ID,
    unitId: UNIT_VILA,
    checklistTemplateId: CHECKLIST_TEMPLATE_ID,
    checklistTemplateVersion: 3,
    assignedTo: "Carlos Souza",
    status: "rework",
    startedAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * HOUR_MS),
    completedAt: new Date(NOW_ANCHOR_EPOCH_MS - 4 * HOUR_MS),
    scorePercent: 58,
    passed: false,
  },
];

// Reservas de amostra usadas só para DERIVAR o horário estimado de check-out (a estadia que
// acabou de liberar a unidade) e a contagem regressiva até o próximo check-in (packages/db/src/
// schema/reservation.ts: `stay` é `daterange` de DATAS CIVIS, sem hora — não existe "hora de
// check-in/check-out" modelada em nenhuma tabela ainda). ./page.tsx combina a data civil de
// `stay` com um horário-padrão de EXEMPLO (11:00 check-out / 15:00 check-in, convenção comum do
// mercado) para chegar a um instante estimado — documentado como estimativa, nunca um dado oficial
// de horário.
export const SAMPLE_RESERVATIONS: readonly ReservationRow[] = [
  // Studio: hóspede saiu hoje de manhã (checkout civil = hoje) e a PRÓXIMA reserva confirmada
  // também começa hoje à tarde — virada apertada, é o caso que deve acender o semáforo de risco.
  {
    id: "c1000000-0000-4000-8000-000000000001",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    stay: "[2026-07-25,2026-07-28)",
    status: "confirmed",
    channel: "direct",
    externalRef: null,
    priceCents: 180000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 10 * 24 * HOUR_MS),
  },
  {
    id: "c1000000-0000-4000-8000-000000000002",
    tenantId: TENANT_ID,
    unitId: UNIT_STUDIO,
    stay: "[2026-07-28,2026-07-30)",
    status: "confirmed",
    channel: "airbnb",
    externalRef: "airbnb-res-30011",
    priceCents: 130000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 5 * 24 * HOUR_MS),
  },
  // Jardins: saiu ontem, próxima reserva só depois de amanhã — sem risco.
  {
    id: "c1000000-0000-4000-8000-000000000003",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    stay: "[2026-07-24,2026-07-27)",
    status: "confirmed",
    channel: "booking",
    externalRef: "booking-res-88420",
    priceCents: 95000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 12 * 24 * HOUR_MS),
  },
  {
    id: "c1000000-0000-4000-8000-000000000004",
    tenantId: TENANT_ID,
    unitId: UNIT_JARDINS,
    stay: "[2026-07-30,2026-08-03)",
    status: "confirmed",
    channel: "direct",
    externalRef: null,
    priceCents: 110000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 8 * 24 * HOUR_MS),
  },
  // Loft: saiu hoje de manhã, e a próxima reserva TAMBÉM começa hoje à tarde — segundo caso de
  // risco (a inspeção precisa ser rápida para não atrasar o check-in).
  {
    id: "c1000000-0000-4000-8000-000000000005",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    stay: "[2026-07-26,2026-07-28)",
    status: "confirmed",
    channel: "vrbo",
    externalRef: "vrbo-res-12044",
    priceCents: 150000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 9 * 24 * HOUR_MS),
  },
  {
    id: "c1000000-0000-4000-8000-000000000006",
    tenantId: TENANT_ID,
    unitId: UNIT_LOFT,
    stay: "[2026-07-28,2026-07-31)",
    status: "confirmed",
    channel: "direct",
    externalRef: null,
    priceCents: 165000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 4 * 24 * HOUR_MS),
  },
  // Casa: já inspecionada, próximo check-in só daqui a alguns dias — sem risco.
  {
    id: "c1000000-0000-4000-8000-000000000007",
    tenantId: TENANT_ID,
    unitId: UNIT_CASA,
    stay: "[2026-07-24,2026-07-27)",
    status: "confirmed",
    channel: "expedia",
    externalRef: "expedia-res-55310",
    priceCents: 220000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 15 * 24 * HOUR_MS),
  },
  {
    id: "c1000000-0000-4000-8000-000000000008",
    tenantId: TENANT_ID,
    unitId: UNIT_CASA,
    stay: "[2026-08-01,2026-08-05)",
    status: "confirmed",
    channel: "direct",
    externalRef: null,
    priceCents: 240000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 6 * 24 * HOUR_MS),
  },
  // Vila: em rework, próximo check-in só daqui a alguns dias — sem risco de tempo (o problema
  // aqui é qualidade, sinalizado pela própria coluna "Rework", não pelo semáforo de prazo).
  {
    id: "c1000000-0000-4000-8000-000000000009",
    tenantId: TENANT_ID,
    unitId: UNIT_VILA,
    stay: "[2026-07-22,2026-07-26)",
    status: "confirmed",
    channel: "direct",
    externalRef: null,
    priceCents: 300000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 18 * 24 * HOUR_MS),
  },
  {
    id: "c1000000-0000-4000-8000-000000000010",
    tenantId: TENANT_ID,
    unitId: UNIT_VILA,
    stay: "[2026-07-31,2026-08-06)",
    status: "confirmed",
    channel: "airbnb",
    externalRef: "airbnb-res-77102",
    priceCents: 320000,
    currency: "BRL",
    guestCount: null,
    checkinTime: null,
    checkoutTime: null,
    earlyCheckinRequested: false,
    earlyCheckinPaid: null,
    earlyCheckinAuthorizedBy: null,
    createdAt: new Date(NOW_ANCHOR_EPOCH_MS - 7 * 24 * HOUR_MS),
  },
];
