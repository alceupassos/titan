// Regra dura do CLAUDE.md raiz: "Alíquota, código de serviço, retenção e prazo de canal: tabela
// versionada. Nunca código." `TaxRule` é essa tabela versionada em forma de tipo — nenhuma
// alíquota aparece como constante numérica solta em nenhum outro arquivo deste pacote;
// `resolveTaxRuleForDate` é o único jeito de obter a alíquota vigente para um cálculo, sempre a
// partir de um conjunto de regras que o chamador carregou (de `packages/db` na Fase 4, fora de
// escopo aqui — este arquivo é zero I/O, mesmo espírito de `rate-plan/rate-plan.ts`).
import type { CivilDate } from "@titan/dates";
import type { Cents } from "../ledger/ledger-entry";

/** Código de município (IBGE, ex.: "3550308" = São Paulo) e código de serviço (ex.: item 9.01 da
 * LC 116/2003, hospedagem) — ambos strings versionadas por `validFrom`/`validTo`, nunca union
 * fechada nem enum: um novo município/serviço é uma LINHA nova nesta tabela, nunca um deploy. */
export interface TaxRule {
  readonly id: string;
  readonly tenantId: string;
  readonly municipalityCode: string;
  readonly serviceCode: string;
  /** Alíquota em pontos-base inteiros — ex.: 500 = 5,00%. Nunca float (mesmo espírito de `Cents`
   * para dinheiro: um percentual como `0.05` sofre os mesmos problemas de arredondamento binário
   * que um valor monetário como float). */
  readonly aliquotBasisPoints: number;
  readonly validFrom: CivilDate;
  readonly validTo: CivilDate;
}

export class NoTaxRuleForDateError extends Error {
  constructor(municipalityCode: string, serviceCode: string, date: CivilDate) {
    super(
      `Nenhuma tax_rule vigente para município ${municipalityCode}, serviço ${serviceCode}, ` +
        `na data ${date} — nunca aplicar alíquota zero silenciosamente. Cadastre a tax_rule ` +
        "vigente antes de emitir a nota (docs/anti-padroes.md #6).",
    );
    this.name = "NoTaxRuleForDateError";
  }
}

/**
 * Duas (ou mais) `TaxRule` para o MESMO município+serviço cobrem a MESMA data — ambiguidade que
 * `resolveTaxRuleForDate` recusa a resolver sozinha (nunca escolhe "a primeira" silenciosamente).
 *
 * Decisão de escopo: esta classe existe, mas este arquivo NÃO expõe uma função separada que
 * varre um conjunto de regras procurando vigências sobrepostas em abstrato (ex.:
 * `assertNoOverlappingValidity(rules)`), porque isso é validação de INSERÇÃO — pertence à borda
 * que grava a `tax_rule` nova (Passo 2 desta fase, `packages/db`, provavelmente como constraint
 * `EXCLUDE USING gist` sobre `daterange(validFrom, validTo)` particionado por
 * município+serviço, mesmo padrão de I1 para `reservations`), não a este pacote de domínio puro.
 * Aqui a ambiguidade só é DETECTADA reativamente, no momento em que alguém pede a regra vigente
 * para uma data específica — o suficiente para nunca aplicar uma alíquota errada por escolha
 * arbitrária, sem duplicar a validação estrutural que o banco fará melhor.
 */
export class OverlappingTaxRuleValidityError extends Error {
  constructor(
    municipalityCode: string,
    serviceCode: string,
    date: CivilDate,
    public readonly matchingRuleIds: readonly string[],
  ) {
    super(
      `Ambiguidade de tax_rule: ${matchingRuleIds.length} regras vigentes para município ` +
        `${municipalityCode}, serviço ${serviceCode}, na data ${date} (ids: ` +
        `${matchingRuleIds.join(", ")}) — vigências sobrepostas nunca são resolvidas escolhendo ` +
        "a primeira em silêncio; corrija o cadastro da tax_rule.",
    );
    this.name = "OverlappingTaxRuleValidityError";
  }
}

/**
 * Resolve a `TaxRule` vigente para município+serviço+data dentre um conjunto já carregado pelo
 * chamador (zero I/O aqui). Vigência é inclusiva nos dois extremos (`validFrom <= date <=
 * validTo`) — comparação lexicográfica funciona porque `CivilDate` é sempre "YYYY-MM-DD" (mesmo
 * padrão de `ratePlanCoversStay`). Lança `NoTaxRuleForDateError` se nenhuma regra cobrir a data,
 * e `OverlappingTaxRuleValidityError` se mais de uma cobrir — nunca escolhe silenciosamente.
 */
export function resolveTaxRuleForDate(
  rules: readonly TaxRule[],
  params: { municipalityCode: string; serviceCode: string; date: CivilDate },
): TaxRule {
  const { municipalityCode, serviceCode, date } = params;

  const matching = rules.filter(
    (rule) =>
      rule.municipalityCode === municipalityCode &&
      rule.serviceCode === serviceCode &&
      date >= rule.validFrom &&
      date <= rule.validTo,
  );

  if (matching.length === 0) {
    throw new NoTaxRuleForDateError(municipalityCode, serviceCode, date);
  }
  if (matching.length > 1) {
    throw new OverlappingTaxRuleValidityError(
      municipalityCode,
      serviceCode,
      date,
      matching.map((rule) => rule.id),
    );
  }
  // Não-nulo garantido pelos dois checks acima (length === 0 e length > 1 já trataram os outros
  // casos) — mesmo padrão de asserção usado em `channel/reconciliation.ts`.
  return matching[0]!;
}

/**
 * Calcula o valor do imposto a partir da base de cálculo e da alíquota em pontos-base da
 * `TaxRule` vigente. Arredondamento bancário simples (`Math.round`, meio para cima) — mesma
 * técnica de `scale()` em `@titan/money`; uma técnica de arredondamento mais sofisticada
 * (half-even) fica para quando o contador confirmar que é exigida (docs/decisoes-de-negocio.md,
 * pergunta 1, ainda pendente de vigência plena da transição CBS/IBS).
 */
export function calculateTaxAmountCents(baseAmountCents: Cents, rule: TaxRule): Cents {
  return Math.round((baseAmountCents * rule.aliquotBasisPoints) / 10000);
}
