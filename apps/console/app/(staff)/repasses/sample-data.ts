// Dados de amostra para a lista de repasses (Fase 5, Passo 4b — docs/fase-atual.md). NÃO há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2" de docs/fase-atual.md),
// então esta rota não consulta `packages/db` durante o desenvolvimento local para LEITURA. O
// CAMINHO DE ESCRITA real (./actions.ts) é o de verdade, contra o banco via `withTenant` — criar/
// enviar/aprovar um lote aqui chama a Server Action real e, sem Docker rodando, falha com erro de
// conexão (mesmo comportamento hoje de apps/console/app/(staff)/reservas/nova/page.tsx e
// apps/console/app/(staff)/aprovacoes/page.tsx). Quando a leitura ganhar dado real, este arquivo é
// descartado e a page passa a buscar via Server Component (`withTenant` + `db.select().from(payoutBatches)`).
//
// Determinístico de propósito (sem `Date.now()`/`Math.random()`) — mesmo espírito de
// apps/console/app/(staff)/aprovacoes/sample-data.ts — para que o preview renderize sempre igual.
import type { Cents } from "@titan/domain";

export type SamplePayoutBatchStatus = "draft" | "pending_approval" | "approved" | "sent" | "failed";

export interface SamplePayoutBatch {
  readonly id: string;
  readonly unitId: string;
  readonly unitName: string;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly grossAmountCents: Cents;
  readonly commissionAmountCents: Cents;
  readonly expensesAmountCents: Cents;
  readonly netAmountCents: Cents;
  readonly currency: "BRL";
  readonly status: SamplePayoutBatchStatus;
  readonly requiresStepUp: boolean;
}

export const SAMPLE_PAYOUT_BATCHES: readonly SamplePayoutBatch[] = [
  {
    id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b01",
    unitId: "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380c01",
    unitName: "Loft Centro 401",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    grossAmountCents: 842000,
    commissionAmountCents: 168400,
    expensesAmountCents: 0,
    netAmountCents: 673600,
    currency: "BRL",
    status: "draft",
    requiresStepUp: false,
  },
  {
    id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b02",
    unitId: "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380c02",
    unitName: "Cobertura Beira-Mar 1201",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    grossAmountCents: 3120000,
    commissionAmountCents: 624000,
    expensesAmountCents: 84000,
    netAmountCents: 2412000,
    currency: "BRL",
    status: "pending_approval",
    requiresStepUp: true,
  },
  {
    id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b03",
    unitId: "c1eebc99-9c0b-4ef8-bb6d-6bb9bd380c03",
    unitName: "Studio Jardins 22",
    periodStart: "2026-05-01",
    periodEnd: "2026-05-31",
    grossAmountCents: 512000,
    commissionAmountCents: 102400,
    expensesAmountCents: 38000,
    netAmountCents: 371600,
    currency: "BRL",
    status: "approved",
    requiresStepUp: false,
  },
];
