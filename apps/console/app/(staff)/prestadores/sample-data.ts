// Dados de amostra do cadastro/pagamento de prestador (Fase 7, Passo 4b — docs/fase-atual.md).
// NÃO há Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2" de
// docs/fase-atual.md), então as duas páginas desta rota (./page.tsx, ./[id]/page.tsx) renderizam
// os dados abaixo como amostra estática — mesmo padrão de
// apps/console/app/(staff)/financeiro/sample-data.ts e .../repasses/sample-data.ts. O CAMINHO DE
// ESCRITA (`updateVendorProfileAction`/`rateVendorAfterWorkOrderAction`/`payVendorInvoiceAction`,
// ./actions.ts) já é real, contra o banco via `withTenant` — chamar essas ações a partir da
// amostra tenta o Postgres real e, sem Docker rodando, falha com erro de conexão (esperado nesta
// fase, não um bug).
//
// Determinístico (sem `Date.now()`/`Math.random()`) — mesmo espírito dos irmãos desta fase, para
// que o preview renderize sempre igual.
import type { Cents } from "@titan/domain";

export type VendorTaxRegimeSample = "pj_cessao_mao_obra" | "pj_simples" | "pf_autonomo";
export type VendorComplianceStatusSample = "pending" | "compliant" | "non_compliant";

export interface SampleVendorProfile {
  readonly id: string;
  readonly name: string;
  readonly document: string; // CPF/CNPJ
  readonly category: string;
  readonly taxRegime: VendorTaxRegimeSample | undefined;
  readonly complianceStatus: VendorComplianceStatusSample;
  readonly ratingAvgBasisPoints: number | undefined; // 0-500 = 0,00-5,00 estrelas
  readonly ratingCount: number;
}

// Cobre os 3 regimes de tributação (seção 9.10.3) + status de compliance variados — inclui um
// prestador SEM regime cadastrado ainda (cadastro incompleto, bloqueia pagamento até ser
// completado por `updateVendorProfileAction`) e um SEM nenhuma avaliação ainda.
export const SAMPLE_VENDOR_PROFILES: readonly SampleVendorProfile[] = [
  {
    id: "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380d01",
    name: "Lavanderia Estrela",
    document: "12.345.678/0001-90",
    category: "lavanderia",
    taxRegime: "pj_simples",
    complianceStatus: "compliant",
    ratingAvgBasisPoints: 460,
    ratingCount: 12,
  },
  {
    id: "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380d02",
    name: "Manutenção Predial Sul",
    document: "23.456.789/0001-01",
    category: "manutencao",
    taxRegime: "pj_cessao_mao_obra",
    complianceStatus: "compliant",
    ratingAvgBasisPoints: 410,
    ratingCount: 7,
  },
  {
    id: "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380d03",
    name: "João Eletricista",
    document: "123.456.789-00",
    category: "manutencao",
    taxRegime: "pf_autonomo",
    complianceStatus: "pending",
    ratingAvgBasisPoints: undefined,
    ratingCount: 0,
  },
  {
    id: "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380d04",
    name: "Condomínio Edifício Aurora",
    document: "34.567.890/0001-12",
    category: "condominio",
    taxRegime: undefined,
    complianceStatus: "non_compliant",
    ratingAvgBasisPoints: undefined,
    ratingCount: 0,
  },
];

export interface SampleVendorAccountsPayable {
  readonly id: string;
  readonly vendorId: string;
  readonly description: string;
  readonly amountCents: Cents;
  readonly currency: "BRL";
  readonly status: "pending" | "approved" | "paid";
  readonly dueDateISO: string;
}

// 2-3 contas a pagar de amostra por prestador, para a tela de detalhe ter algo real para exibir
// (clicar em "Pagar" chama `payVendorInvoiceAction` de verdade contra o Postgres — mesmo aviso do
// cabeçalho do arquivo).
export const SAMPLE_VENDOR_ACCOUNTS_PAYABLE: readonly SampleVendorAccountsPayable[] = [
  {
    id: "e4eebc99-9c0b-4ef8-bb6d-6bb9bd380e01",
    vendorId: SAMPLE_VENDOR_PROFILES[0]!.id,
    description: "Lavagem de enxoval — virada de agosto (14 unidades).",
    amountCents: 51000,
    currency: "BRL",
    status: "pending",
    dueDateISO: "2026-08-10",
  },
  {
    id: "e4eebc99-9c0b-4ef8-bb6d-6bb9bd380e02",
    vendorId: SAMPLE_VENDOR_PROFILES[1]!.id,
    description: "Reparo de vazamento — Studio Beira-Mar 12.",
    amountCents: 220000,
    currency: "BRL",
    status: "pending",
    dueDateISO: "2026-08-08",
  },
  {
    id: "e4eebc99-9c0b-4ef8-bb6d-6bb9bd380e03",
    vendorId: SAMPLE_VENDOR_PROFILES[2]!.id,
    description: "Troca de disjuntor — Loft Centro 401.",
    amountCents: 35000,
    currency: "BRL",
    status: "pending",
    dueDateISO: "2026-08-12",
  },
];

export interface SampleVendorWorkOrder {
  readonly id: string;
  readonly vendorId: string;
  readonly description: string;
  // "paid" — elegível para avaliação (transição paid -> rated de
  // packages/domain/src/work-order/state-machine.ts, via `rateVendorAfterWorkOrderAction`);
  // "rated" — já avaliada, `rating` presente.
  readonly status: "paid" | "rated";
  readonly rating: number | undefined;
}

// Histórico de OS concluídas por prestador (seção 9.10.4) — mistura OS já avaliada (`rated`) com
// OS paga aguardando avaliação (`paid`), para a tela de detalhe exercitar tanto a exibição do
// histórico quanto o formulário real de `rateVendorAfterWorkOrderAction`.
export const SAMPLE_VENDOR_WORK_ORDERS: readonly SampleVendorWorkOrder[] = [
  {
    id: "a6eebc99-9c0b-4ef8-bb6d-6bb9bd380a01",
    vendorId: SAMPLE_VENDOR_PROFILES[0]!.id,
    description: "Lavagem de enxoval — virada de julho (12 unidades).",
    status: "rated",
    rating: 5,
  },
  {
    id: "a6eebc99-9c0b-4ef8-bb6d-6bb9bd380a02",
    vendorId: SAMPLE_VENDOR_PROFILES[1]!.id,
    description: "Reparo de infiltração — Studio Beira-Mar 12.",
    status: "paid",
    rating: undefined,
  },
  {
    id: "a6eebc99-9c0b-4ef8-bb6d-6bb9bd380a03",
    vendorId: SAMPLE_VENDOR_PROFILES[2]!.id,
    description: "Troca de fiação — Loft Centro 401.",
    status: "rated",
    rating: 4,
  },
];

export interface SampleVendorRetentionRule {
  readonly id: string;
  readonly taxRegime: VendorTaxRegimeSample;
  readonly inssBasisPoints: number;
  readonly irrfBasisPoints: number;
  readonly csrfBasisPoints: number;
  readonly issBasisPoints: number;
  readonly validFrom: string;
  readonly validTo: string;
}

// VALORES DE EXEMPLO (seção 9.10.3 do prompt único) — PENDENTES DE CONFIRMAÇÃO FORMAL DO
// CONTADOR antes de produção real, mesma ressalva já usada para `tax_rules` desde a Fase 4
// (docs/fase-atual.md). Um por regime:
// - pj_cessao_mao_obra: INSS 11,00% + IRRF 1,50% + CSRF 4,65% (retenções federais unificadas,
//   IN RFB 1.234/2012) + ISS 5,00% (exemplo — varia por município real).
// - pj_simples: sem retenção federal na maioria dos casos (optante do Simples Nacional já recolhe
//   tudo no DAS) + ISS 5,00% (exemplo).
// - pf_autonomo: INSS 11,00% + IRRF por tabela progressiva — aqui simplificado para um valor
//   FIXO de exemplo (7,50%), nunca a tabela progressiva real (fora do escopo desta fase).
export const SAMPLE_VENDOR_RETENTION_RULES: readonly SampleVendorRetentionRule[] = [
  {
    id: "f5eebc99-9c0b-4ef8-bb6d-6bb9bd380f01",
    taxRegime: "pj_cessao_mao_obra",
    inssBasisPoints: 1100,
    irrfBasisPoints: 150,
    csrfBasisPoints: 465,
    issBasisPoints: 500,
    validFrom: "2026-01-01",
    validTo: "2099-12-31",
  },
  {
    id: "f5eebc99-9c0b-4ef8-bb6d-6bb9bd380f02",
    taxRegime: "pj_simples",
    inssBasisPoints: 0,
    irrfBasisPoints: 0,
    csrfBasisPoints: 0,
    issBasisPoints: 500,
    validFrom: "2026-01-01",
    validTo: "2099-12-31",
  },
  {
    id: "f5eebc99-9c0b-4ef8-bb6d-6bb9bd380f03",
    taxRegime: "pf_autonomo",
    inssBasisPoints: 1100,
    irrfBasisPoints: 750,
    csrfBasisPoints: 0,
    issBasisPoints: 0,
    validFrom: "2026-01-01",
    validTo: "2099-12-31",
  },
];
