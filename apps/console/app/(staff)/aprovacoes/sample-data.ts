// Dados de amostra para a fila de aprovações (Fase 2, Passo 4 — docs/fase-atual.md). NÃO há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2" de docs/fase-atual.md),
// então esta rota não pode consultar `packages/db` durante o desenvolvimento local. Estes
// registros são só para a UI ter algo visível: o CAMINHO DE ESCRITA real
// (`decideApprovalAction`, ./actions.ts) é o de verdade, contra o banco via `withTenant` — clicar
// em aprovar/rejeitar aqui chama o Server Action real e, sem Docker rodando, falha com erro de
// conexão (mesmo comportamento hoje de apps/console/app/(staff)/reservas/nova/page.tsx). Quando a
// fila ganhar leitura real, este arquivo é descartado e a page passa a buscar via Server
// Component (`withTenant` + `db.select().from(approvalRequests)`).
//
// Determinístico de propósito (sem `Date.now()`/`Math.random()`) — mesmo espírito de
// apps/console/app/(staff)/calendario/sample-data.ts — para que o preview renderize sempre igual.
import type { ApprovalRequest } from "@titan/domain";

const SLA_ANCHOR_EPOCH_MS = Date.parse("2026-07-28T09:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

export const SAMPLE_APPROVAL_REQUESTS: readonly ApprovalRequest[] = [
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
    tenantId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00",
    type: "refund",
    requestedBy: "user_ana.suporte",
    rationale:
      "Hóspede reportou vazamento no chuveiro na 2ª noite da estadia — reembolso parcial de uma diária " +
      "acordado por telefone, confirmado por e-mail em anexo ao ticket.",
    impact: { amountCents: 45000, affectedEntities: ["reservation:r-9f21"] },
    risk: "medium",
    requiredApprovals: 1,
    stepUpRequired: false,
    slaAtEpochMs: SLA_ANCHOR_EPOCH_MS + 20 * HOUR_MS,
    status: "pending",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12",
    tenantId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00",
    type: "payout_batch",
    requestedBy: "agent:pricing-scientist v0.3",
    rationale:
      "Lote mensal de repasse a 6 proprietários — nenhuma divergência encontrada na conciliação " +
      "automática contra o extrato do gateway.",
    impact: { amountCents: 1284300, affectedEntities: ["payout_batch:pb-2026-07"] },
    risk: "high",
    requiredApprovals: 2,
    stepUpRequired: true,
    slaAtEpochMs: SLA_ANCHOR_EPOCH_MS + 6 * HOUR_MS,
    status: "pending",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13",
    tenantId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00",
    type: "purchase_order",
    requestedBy: "user_carla.operacoes",
    rationale:
      "Reposição de enxoval (18 jogos de cama) para o Loft Centro 401 — fornecedor já homologado, sem " +
      "cotação concorrente por o valor estar abaixo da alçada usual de compra recorrente.",
    impact: { amountCents: 218000, affectedEntities: ["unit:loft-centro-401"] },
    risk: "low",
    requiredApprovals: 1,
    stepUpRequired: false,
    slaAtEpochMs: SLA_ANCHOR_EPOCH_MS + 48 * HOUR_MS,
    status: "pending",
  },
  {
    id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14",
    tenantId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a00",
    type: "fiscal_cancellation",
    requestedBy: "user_marcos.financeiro",
    rationale:
      "NFS-e emitida com CNPJ do tomador incorreto — cancelamento solicitado dentro do prazo municipal, " +
      "substituição já preparada para emissão em seguida.",
    impact: { affectedEntities: ["fiscal_document:nfse-2026-000842"] },
    risk: "medium",
    requiredApprovals: 1,
    stepUpRequired: false,
    slaAtEpochMs: SLA_ANCHOR_EPOCH_MS + 3 * HOUR_MS,
    status: "pending",
  },
];
