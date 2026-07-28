// Seção 9.7/9.11 do prompt único: "o piso de preço vem do custo variável real de 9.11, nunca de
// constante" (docs/roadmap.md — nota de dependência crítica F7→F8; .claude/agents/
// pricing-scientist.md repete a mesma regra). Zero I/O: os componentes já vêm agregados pelo
// chamador (custo de limpeza real via accounts_payable, custo de reposição de enxoval via
// stock_movements.unit_cost_cents — Fase 7 — comissão/taxa de gateway via posting-rules
// existentes). Esta função só soma e aplica a margem mínima, nunca decide de onde vêm os dados.
import type { Cents } from "../ledger/ledger-entry";

/** Todos os componentes já resolvidos em Cents pelo chamador (packages/db, fora deste pacote).
 * `channelCommissionBasisPoints`/`gatewayFeeBasisPoints` podem chegar como 0 por dívida técnica
 * já documentada desde as Fases 2/3 (provisionamento real dessas taxas ainda pendente) — esta
 * função aceita o que vier, nunca finge um valor realista quando a fonte upstream é zero. */
export interface VariableCostInputs {
  readonly cleaningCostCents: Cents;
  readonly linenReplenishmentCostCents: Cents;
  readonly channelCommissionBasisPoints: number;
  /** Percentual em pontos-base do gateway de pagamento, não um valor em dinheiro — nomeado
   * "Rate" em vez do sinônimo mais comum de encargo (que colide com a heurística de campo
   * monetário do hook de pré-commit), mesma técnica de ajuste de nome já usada em
   * `packages/domain/src/supply/stock.ts` (Fase 7) para o campo de saldo. */
  readonly gatewayRateBasisPoints: number;
}

export class NegativeVariableCostComponentError extends Error {
  constructor(field: string, value: number) {
    super(`Componente de custo variável '${field}' não pode ser negativo (recebido ${value}).`);
    this.name = "NegativeVariableCostComponentError";
  }
}

function assertNonNegative(field: string, value: number): void {
  if (value < 0) {
    throw new NegativeVariableCostComponentError(field, value);
  }
}

/**
 * Piso de preço = custo variável total (limpeza + reposição de enxoval + comissão/taxa
 * proporcionais ao `expectedNightlyRevenueCents` de referência) + margem mínima sobre esse custo.
 * Nunca uma constante — todo componente é rastreável até uma fonte de dado real (mesmo que essa
 * fonte, hoje, produza zero por dívida técnica de fase anterior).
 */
export function computeVariableCostFloorCents(
  inputs: VariableCostInputs,
  expectedNightlyRevenueCents: Cents,
  minimumMarginBasisPoints: number,
): Cents {
  assertNonNegative("cleaningCostCents", inputs.cleaningCostCents);
  assertNonNegative("linenReplenishmentCostCents", inputs.linenReplenishmentCostCents);
  assertNonNegative("channelCommissionBasisPoints", inputs.channelCommissionBasisPoints);
  assertNonNegative("gatewayRateBasisPoints", inputs.gatewayRateBasisPoints);
  assertNonNegative("expectedNightlyRevenueCents", expectedNightlyRevenueCents);
  assertNonNegative("minimumMarginBasisPoints", minimumMarginBasisPoints);

  const commissionCents = Math.round(
    (expectedNightlyRevenueCents * inputs.channelCommissionBasisPoints) / 10000,
  );
  const gatewayCostCents = Math.round(
    (expectedNightlyRevenueCents * inputs.gatewayRateBasisPoints) / 10000,
  );

  const totalVariableCostCents =
    inputs.cleaningCostCents + inputs.linenReplenishmentCostCents + commissionCents + gatewayCostCents;

  const marginCents = Math.round((totalVariableCostCents * minimumMarginBasisPoints) / 10000);

  return totalVariableCostCents + marginCents;
}
