// Fase 5, Passo 1 — extrato de repasse ao proprietário (docs/decisoes-de-negocio.md, pergunta 4).
// Dado o `AdministrationContract` vigente (ver `administration-contract.ts`) e a receita bruta do
// período, calcula comissão + (se aplicável) despesas itemizadas + líquido a repassar. Zero I/O:
// o chamador já resolveu o contrato vigente (via `resolveAdministrationContractForDate`) e já
// somou a receita bruta e as despesas do período — este arquivo só faz a aritmética determinística
// do extrato, mesmo espírito de `calculateTaxAmountCents` em `packages/domain/src/fiscal/tax-rule.ts`.
import type { CurrencyCode } from "@titan/money";
import type { AdministrationContract } from "./administration-contract";
import type { Cents } from "../ledger/ledger-entry";

/** Uma linha de despesa itemizada do período — só tem sentido quando `itemPaymentModel ===
 * "owner_pays_itemized"` (limpeza, enxoval, manutenção, amenities já rateados para esta unidade
 * neste período; o rateio em si é responsabilidade da borda que monta este parâmetro, fora de
 * escopo aqui). */
export interface PayoutExtractLineItem {
  readonly description: string;
  readonly amountCents: Cents;
}

export interface ComputePayoutExtractParams {
  readonly grossRevenueCents: Cents;
  readonly currency: CurrencyCode;
  readonly contract: AdministrationContract;
  /** Só relevante quando `contract.itemPaymentModel === "owner_pays_itemized"`. Se o contrato for
   * `"titan_pays_all"` e este campo vier preenchido mesmo assim, ele é IGNORADO por completo —
   * nunca somado ao líquido — porque despesas nunca são cobradas do proprietário fora do que o
   * contrato dele autoriza (docs/decisoes-de-negocio.md, pergunta 4: o contrato é quem decide
   * quem paga cada item, não o chamador desta função). */
  readonly itemizedExpenses?: readonly PayoutExtractLineItem[];
}

export interface PayoutExtract {
  readonly grossRevenueCents: Cents;
  readonly commissionCents: Cents;
  /** 0 se `itemPaymentModel === "titan_pays_all"`. */
  readonly itemizedExpensesCents: Cents;
  /** gross - commission - itemizedExpenses. */
  readonly netPayoutCents: Cents;
  readonly currency: CurrencyCode;
  readonly lineItems: readonly PayoutExtractLineItem[];
}

/**
 * Calcula o extrato de repasse a partir da receita bruta do período e do contrato de
 * administração vigente. Comissão sempre sobre a receita BRUTA (nunca líquida — pergunta 4 já
 * confirmada), arredondamento `Math.round` — mesmo padrão de `calculateTaxAmountCents`.
 *
 * Fronteira de escopo: esta função NÃO decide o modelo de pagamento de itens — ela só OBEDECE ao
 * que `contract.itemPaymentModel` já diz. Se for `"titan_pays_all"`, `itemizedExpenses` do
 * parâmetro é descartado inteiramente (mesmo que venha preenchido) e o extrato reflete
 * `itemizedExpensesCents: 0`, `lineItems: []` — nunca uma cobrança "por engano" ao proprietário
 * fora do que o contrato dele autoriza.
 */
export function computePayoutExtract(params: ComputePayoutExtractParams): PayoutExtract {
  const { grossRevenueCents, currency, contract } = params;

  const commissionCents = Math.round((grossRevenueCents * contract.commissionBasisPoints) / 10000);

  const isItemized = contract.itemPaymentModel === "owner_pays_itemized";
  const lineItems = isItemized ? (params.itemizedExpenses ?? []) : [];
  const itemizedExpensesCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

  const netPayoutCents = grossRevenueCents - commissionCents - itemizedExpensesCents;

  return {
    grossRevenueCents,
    commissionCents,
    itemizedExpensesCents,
    netPayoutCents,
    currency,
    lineItems,
  };
}
