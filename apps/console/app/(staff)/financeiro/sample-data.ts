// Dados de amostra do fluxo de Contas a Pagar (Fase 5, Passo 4a — docs/fase-atual.md). NÃO há
// Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2" de docs/fase-atual.md),
// então esta rota não pode consultar `packages/db` durante o desenvolvimento local — mesmo padrão
// de apps/console/app/(staff)/aprovacoes/sample-data.ts e .../fiscal/sample-data.ts. O CAMINHO DE
// ESCRITA real (`submitAccountsPayableAction`/`payAccountsPayableAction`, ./actions.ts) já é
// verdadeiro, contra o banco via `withTenant` — os registros abaixo só existem para a UI ter algo
// visível: clicar em "Marcar como paga" aqui chama a Server Action real e, sem Docker rodando,
// falha com erro de conexão (mesmo comportamento hoje das outras rotas do cockpit).
//
// Denormalizado de propósito (`vendorName`/`vendorCategory` embutidos na própria linha de AP, em
// vez de um join): quando a leitura ganhar dado real, a query troca por
// `db.select().from(accountsPayable).innerJoin(vendors, ...)`.
//
// Determinístico (sem `Date.now()`/`Math.random()`) — mesmo espírito de ./sample-data.ts dos
// irmãos desta fase, para que o preview renderize sempre igual.
import type { Cents } from "@titan/domain";

export type AccountsPayableStatus = "pending" | "approved" | "paid";
export type AccountsPayableApprovalStatus = "pending" | "approved" | "rejected";

export interface SampleVendor {
  readonly id: string;
  readonly name: string;
  readonly category: string;
}

export const SAMPLE_VENDORS: readonly SampleVendor[] = [
  { id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b01", name: "Lavanderia Estrela", category: "lavanderia" },
  { id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b02", name: "Manutenção Predial Sul", category: "manutencao" },
  { id: "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380b03", name: "Condomínio Edifício Aurora", category: "condominio" },
];

export interface SampleAccountsPayable {
  readonly id: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly vendorCategory: string;
  readonly unitLabel: string | undefined;
  readonly description: string;
  readonly amountCents: Cents;
  readonly currency: "BRL" | "USD" | "EUR";
  readonly status: AccountsPayableStatus;
  readonly dueDateISO: string;
  readonly approvalStatus: AccountsPayableApprovalStatus;
  readonly paidAtISO: string | undefined;
}

export const SAMPLE_ACCOUNTS_PAYABLE: readonly SampleAccountsPayable[] = [
  {
    id: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c01",
    vendorId: SAMPLE_VENDORS[0]!.id,
    vendorName: SAMPLE_VENDORS[0]!.name,
    vendorCategory: SAMPLE_VENDORS[0]!.category,
    unitLabel: "Loft Centro 401",
    description: "Lavagem de enxoval — virada de julho (12 unidades).",
    amountCents: 42000,
    currency: "BRL",
    status: "pending",
    dueDateISO: "2026-08-05",
    approvalStatus: "pending",
    paidAtISO: undefined,
  },
  {
    id: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c02",
    vendorId: SAMPLE_VENDORS[1]!.id,
    vendorName: SAMPLE_VENDORS[1]!.name,
    vendorCategory: SAMPLE_VENDORS[1]!.category,
    unitLabel: "Studio Beira-Mar 12",
    description: "Reparo de infiltração no banheiro — orçamento já aprovado por telefone.",
    amountCents: 185000,
    currency: "BRL",
    status: "approved",
    dueDateISO: "2026-08-02",
    approvalStatus: "approved",
    paidAtISO: undefined,
  },
  {
    id: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c03",
    vendorId: SAMPLE_VENDORS[2]!.id,
    vendorName: SAMPLE_VENDORS[2]!.name,
    vendorCategory: SAMPLE_VENDORS[2]!.category,
    unitLabel: undefined,
    description: "Rateio de condomínio — competência julho/2026.",
    amountCents: 96000,
    currency: "BRL",
    status: "paid",
    dueDateISO: "2026-07-10",
    approvalStatus: "approved",
    paidAtISO: "2026-07-09",
  },
  {
    id: "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380c04",
    vendorId: SAMPLE_VENDORS[1]!.id,
    vendorName: SAMPLE_VENDORS[1]!.name,
    vendorCategory: SAMPLE_VENDORS[1]!.category,
    unitLabel: "Loft Centro 401",
    description: "Substituição de ar-condicionado — acima da alçada de compra recorrente.",
    amountCents: 480000,
    currency: "BRL",
    status: "pending",
    dueDateISO: "2026-08-15",
    approvalStatus: "rejected",
    paidAtISO: undefined,
  },
];
