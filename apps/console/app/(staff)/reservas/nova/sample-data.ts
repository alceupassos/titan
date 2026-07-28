// Dados de amostra para o formulário de nova reserva (Fase 1, Passo 5) — NÃO há Postgres vivo
// nesta máquina (Docker Desktop parado, docs/fase-atual.md "Gap conhecido 2"), então esta rota
// não pode popular o select de unidade/tarifa com uma query real. Mesmo padrão de
// apps/console/app/(staff)/calendario/sample-data.ts: em vez de inventar rótulos soltos, os ids
// aqui são UUIDs v4 válidos (a Server Action valida `unitId`/`ratePlanId` com `z.string().uuid()`
// — ver packages/contracts/src/reservation.ts) para que o fluxo real de validação/autorização/DB
// seja exercitado ponta a ponta; só não existe LINHA correspondente num banco vivo, então a
// Server Action falha honestamente (unidade/plano não encontrados, ou erro de conexão) em vez de
// fingir sucesso. Quando F1+ ligar consulta real, este arquivo é descartado.
export interface SampleUnit {
  readonly id: string;
  readonly name: string;
}

export interface SampleRatePlan {
  readonly id: string;
  readonly unitId: string;
  readonly name: string;
  readonly nightlyPriceLabel: string;
}

export const SAMPLE_UNITS: readonly SampleUnit[] = [
  { id: "a0000000-0000-4000-8000-000000000001", name: "Studio Vista Mar 101" },
  { id: "a0000000-0000-4000-8000-000000000002", name: "Apartamento Jardins 202" },
  { id: "a0000000-0000-4000-8000-000000000003", name: "Loft Centro 401" },
  { id: "a0000000-0000-4000-8000-000000000004", name: "Casa de Praia Enseada" },
];

export const SAMPLE_RATE_PLANS: readonly SampleRatePlan[] = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    unitId: "a0000000-0000-4000-8000-000000000001",
    name: "Tarifa Padrão",
    nightlyPriceLabel: "R$ 350,00/noite",
  },
  {
    id: "b0000000-0000-4000-8000-000000000002",
    unitId: "a0000000-0000-4000-8000-000000000002",
    name: "Tarifa Padrão",
    nightlyPriceLabel: "R$ 400,00/noite",
  },
  {
    id: "b0000000-0000-4000-8000-000000000003",
    unitId: "a0000000-0000-4000-8000-000000000003",
    name: "Tarifa Padrão",
    nightlyPriceLabel: "R$ 380,00/noite",
  },
  {
    id: "b0000000-0000-4000-8000-000000000004",
    unitId: "a0000000-0000-4000-8000-000000000004",
    name: "Tarifa Padrão",
    nightlyPriceLabel: "R$ 550,00/noite",
  },
];

export const SAMPLE_CHANNELS = ["direct", "airbnb", "booking", "vrbo", "expedia"] as const;
