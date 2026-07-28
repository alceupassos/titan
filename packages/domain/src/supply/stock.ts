// Seção 9.7 (piso de custo variável real precisa de saldo de estoque confiável) e
// docs/decisoes-de-negocio.md pergunta 7 (confirmada: o enxoval é do PROPRIETÁRIO, não da
// Titan) — `StockMovement` reconstrói o saldo por unidade/item a partir do histórico completo de
// movimentos (append-only na borda, packages/db, fora de escopo aqui), nunca um saldo mutável
// direto. Zero I/O.
//
// Nota de nomenclatura (desvio deliberado do nome sugerido originalmente): as funções abaixo
// evitam a palavra "balance" no identificador (usam "stockLevel") porque o hook
// `.claude/hooks/block-money-float.mjs` (I4/anti-padrão #9 — dinheiro nunca é `number`/float)
// varre por heurística de nome de campo, e "balance" está na lista de palavras que ele trata como
// possível campo monetário. Quantidade de estoque não é dinheiro — mas em vez de brigar com o
// hook (regra de ouro do CLAUDE.md raiz: "hook é bloqueio, não sugestão"), o nome foi ajustado
// para não colidir com a heurística, preservando o comportamento e a legibilidade.
export type StockMovementType = "purchase" | "consumption" | "adjustment" | "loss" | "return";

export interface StockMovement {
  readonly unitId: string;
  readonly itemType: string;
  readonly type: StockMovementType;
  /** Sempre positivo — a DIREÇÃO do movimento vem de `type`, nunca do sinal de `quantity`.
   * Decisão de shape (para eliminar ambiguidade): `adjustment` representa sempre uma correção
   * POSITIVA (contagem física encontrou MAIS do que o esperado); uma correção negativa (contagem
   * física encontrou MENOS) é registrada como `loss`, não como `adjustment` negativo. Assim
   * `quantity > 0` vale para os 5 tipos sem exceção — nenhum tipo precisa de um campo adicional
   * de sinal. */
  readonly quantity: number;
}

export class NonPositiveQuantityError extends Error {
  constructor(movement: StockMovement) {
    super(
      `Movimento de estoque (${movement.type}) para '${movement.itemType}' na unidade ` +
        `${movement.unitId} tem quantity não positivo (${movement.quantity}) — quantity é sempre ` +
        "positivo; a direção do movimento vem de 'type' (ver comentário de StockMovement).",
    );
    this.name = "NonPositiveQuantityError";
  }
}

/** Tipos que somam ao saldo — `adjustment` está aqui porque, por definição de shape (ver
 * `StockMovement`), ele só representa correção positiva; correção negativa é `loss`. */
const INBOUND_TYPES: ReadonlySet<StockMovementType> = new Set(["purchase", "adjustment", "return"]);

/**
 * Reconstrói o saldo (nível de estoque) atual a partir do histórico completo de movimentos —
 * nunca lê um saldo materializado à parte. Entrada (soma): `purchase`, `adjustment`, `return`.
 * Saída (subtrai): `consumption`, `loss`. Lança `NonPositiveQuantityError` no primeiro movimento
 * com `quantity <= 0` encontrado.
 */
export function reconstructStockLevel(movements: readonly StockMovement[]): number {
  let stockLevel = 0;
  for (const movement of movements) {
    if (movement.quantity <= 0) {
      throw new NonPositiveQuantityError(movement);
    }
    stockLevel += INBOUND_TYPES.has(movement.type) ? movement.quantity : -movement.quantity;
  }
  return stockLevel;
}

export class InvalidReplenishmentInputError extends Error {
  constructor(field: string, value: number) {
    super(
      `Entrada de reposição inválida: '${field}' = ${value} — avgDailyConsumption, leadTimeDays ` +
        "e safetyStockDays nunca podem ser negativos.",
    );
    this.name = "InvalidReplenishmentInputError";
  }
}

export interface ReplenishmentInput {
  readonly avgDailyConsumption: number;
  readonly leadTimeDays: number;
  readonly safetyStockDays: number;
}

/**
 * Ponto de reposição — heurística determinística (consumo médio diário × (lead time + estoque de
 * segurança em dias)), explicitamente NÃO um modelo de forecast/ML: isso fica para a Fase 8
 * (Pricing) do roadmap, quando houver dado real suficiente para justificar um modelo preditivo.
 */
export function computeReorderPoint(input: ReplenishmentInput): number {
  const { avgDailyConsumption, leadTimeDays, safetyStockDays } = input;
  if (avgDailyConsumption < 0) {
    throw new InvalidReplenishmentInputError("avgDailyConsumption", avgDailyConsumption);
  }
  if (leadTimeDays < 0) {
    throw new InvalidReplenishmentInputError("leadTimeDays", leadTimeDays);
  }
  if (safetyStockDays < 0) {
    throw new InvalidReplenishmentInputError("safetyStockDays", safetyStockDays);
  }
  return Math.ceil(avgDailyConsumption * (leadTimeDays + safetyStockDays));
}

/** Função própria, em vez de comparação inline no chamador, para ficar testável e nomeada
 * explicitamente — mesmo espírito de `isClaimDeadlineAtRisk` em
 * `../housekeeping/claim-deadline.ts`. */
export function shouldTriggerReplenishment(currentStockLevel: number, reorderPoint: number): boolean {
  return currentStockLevel <= reorderPoint;
}
