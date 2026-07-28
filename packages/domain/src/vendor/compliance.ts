// Seção 9.10.4 do prompt único: scorecard de prestador. Decisão de escopo desta tarefa (Fase 7,
// Passo 1): implementar só a MÉDIA SIMPLES das notas por OS concluída — o scorecard
// multi-critério ponderado completo (prazo, qualidade, comunicação, preço) da seção 9.10.4 fica
// para quando houver mais critérios reais medidos além de uma nota única por OS. Zero I/O.
export type VendorComplianceStatus = "pending" | "compliant" | "non_compliant";

export class EmptyRatingsError extends Error {
  constructor() {
    super(
      "Não é possível calcular a média de avaliações de um prestador sem nenhuma nota — nunca " +
        "retornar 0/NaN silencioso para 'sem avaliação ainda'; quem chama decide o que exibir na " +
        "ausência (ex.: 'sem histórico').",
    );
    this.name = "EmptyRatingsError";
  }
}

/**
 * Média aritmética simples das notas do prestador por OS concluída. Lança `EmptyRatingsError`
 * para array vazio em vez de devolver `0`/`NaN` — ver nota de escopo no topo do arquivo sobre o
 * scorecard multi-critério completo ficar para depois.
 */
export function computeVendorScoreAverage(ratings: readonly number[]): number {
  if (ratings.length === 0) {
    throw new EmptyRatingsError();
  }
  const sum = ratings.reduce((acc, rating) => acc + rating, 0);
  return sum / ratings.length;
}
