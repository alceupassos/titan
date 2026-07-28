// Seção 9.10.3 do prompt único: o regime de tributação do prestador (PJ com cessão de mão de
// obra, PJ optante pelo Simples, PF autônomo) determina QUAIS retenções incidem sobre o
// pagamento (INSS, IRRF, CSRF, ISS) e em que percentual. `VendorRetentionRule` é essa tabela
// versionada por vigência — mesmo padrão de `TaxRule` (../fiscal/tax-rule.ts): regra dura do
// CLAUDE.md raiz ("alíquota, código de serviço, retenção e prazo de canal: tabela versionada,
// nunca código") aplicada agora à retenção de prestador. Zero I/O: o conjunto de regras já
// carregado é responsabilidade do chamador (packages/db, fora de escopo desta fase).
import type { CivilDate } from "@titan/dates";
import type { Cents } from "../ledger/ledger-entry";

/** Regime de tributação do prestador (seção 9.10.3) — determina o conjunto de retenções
 * aplicáveis ao pagamento. Union fechada (diferente de município/serviço/canal, que ganham linha
 * nova sem mudar código): só existem 3 regimes reais previstos na legislação para este contexto. */
export type VendorTaxRegime = "pj_cessao_mao_obra" | "pj_simples" | "pf_autonomo";

/**
 * Conjunto de retenções vigente para um regime de tributação de prestador — mesma forma de
 * `TaxRule`, com `taxRegime` no lugar de município+serviço. Todos os percentuais em pontos-base
 * inteiros (ex.: 1100 = 11,00% de INSS) — nunca float, mesmo espírito de `aliquotBasisPoints`
 * em `../fiscal/tax-rule.ts`.
 */
export interface VendorRetentionRule {
  readonly id: string;
  readonly tenantId: string;
  readonly taxRegime: VendorTaxRegime;
  readonly inssBasisPoints: number;
  readonly irrfBasisPoints: number;
  readonly csrfBasisPoints: number;
  readonly issBasisPoints: number;
  readonly validFrom: CivilDate;
  readonly validTo: CivilDate;
}

export class NoVendorRetentionRuleForRegimeError extends Error {
  constructor(taxRegime: VendorTaxRegime, date: CivilDate) {
    super(
      `Nenhuma vendor_retention_rule vigente para o regime ${taxRegime} na data ${date} — nunca ` +
        "aplicar retenção zero silenciosamente. Cadastre a regra vigente antes de calcular o " +
        "pagamento do prestador (docs/invariantes.md; docs/anti-padroes.md #6).",
    );
    this.name = "NoVendorRetentionRuleForRegimeError";
  }
}

/**
 * Duas (ou mais) `VendorRetentionRule` para o MESMO regime cobrem a MESMA data — ambiguidade que
 * `resolveVendorRetentionRuleForDate` recusa a resolver sozinha, mesmo padrão de
 * `OverlappingTaxRuleValidityError`/`OverlappingAdministrationContractError`. A validação
 * estrutural de vigências que não se sobrepõem (provavelmente `EXCLUDE USING gist` sobre
 * `daterange(validFrom, validTo)` particionado por regime) pertence à borda que grava a regra
 * nova, não a este pacote de domínio puro.
 */
export class OverlappingVendorRetentionRuleValidityError extends Error {
  constructor(
    taxRegime: VendorTaxRegime,
    date: CivilDate,
    public readonly matchingRuleIds: readonly string[],
  ) {
    super(
      `Ambiguidade de vendor_retention_rule: ${matchingRuleIds.length} regras vigentes para o ` +
        `regime ${taxRegime}, na data ${date} (ids: ${matchingRuleIds.join(", ")}) — vigências ` +
        "sobrepostas nunca são resolvidas escolhendo a primeira em silêncio; corrija o cadastro " +
        "da regra de retenção de prestador.",
    );
    this.name = "OverlappingVendorRetentionRuleValidityError";
  }
}

/**
 * Resolve a `VendorRetentionRule` vigente para regime+data dentre um conjunto já carregado pelo
 * chamador (zero I/O aqui) — mesma lógica de `resolveTaxRuleForDate`/
 * `resolveAdministrationContractForDate`. Vigência é inclusiva nos dois extremos (`validFrom <=
 * date <= validTo`); comparação lexicográfica funciona porque `CivilDate` é sempre "YYYY-MM-DD".
 */
export function resolveVendorRetentionRuleForDate(
  rules: readonly VendorRetentionRule[],
  params: { taxRegime: VendorTaxRegime; date: CivilDate },
): VendorRetentionRule {
  const { taxRegime, date } = params;

  const matching = rules.filter(
    (rule) => rule.taxRegime === taxRegime && date >= rule.validFrom && date <= rule.validTo,
  );

  if (matching.length === 0) {
    throw new NoVendorRetentionRuleForRegimeError(taxRegime, date);
  }
  if (matching.length > 1) {
    throw new OverlappingVendorRetentionRuleValidityError(
      taxRegime,
      date,
      matching.map((rule) => rule.id),
    );
  }
  // Não-nulo garantido pelos dois checks acima — mesmo padrão de asserção usado em
  // `fiscal/tax-rule.ts` e `administration/administration-contract.ts`.
  return matching[0]!;
}

export interface VendorRetentionAmounts {
  readonly inssCents: Cents;
  readonly irrfCents: Cents;
  readonly csrfCents: Cents;
  readonly issCents: Cents;
  readonly netCents: Cents;
}

/**
 * Calcula as 4 retenções + o líquido a partir do valor bruto e da `VendorRetentionRule` vigente.
 * Decisão de arredondamento (documentada, não óbvia): INSS/IRRF/CSRF/ISS são cada um calculado de
 * forma independente por `Math.round(grossCents * basisPoints / 10000)`; `netCents` NUNCA é
 * calculado por um `basisPoints` próprio (não existe "netBasisPoints" nesta regra) — ele é sempre
 * a DIFERENÇA `grossCents − (as 4 retenções já arredondadas)`. Isso garante por construção que
 * `netCents + inssCents + irrfCents + csrfCents + issCents === grossCents` sempre, mesmo quando
 * cada retenção individual arredonda para cima/baixo de formas diferentes — o líquido é quem
 * absorve a sobra/falta de centavo do arredondamento composto, nunca uma das retenções. Isso
 * evita a classe de bug em que 4 valores independentemente arredondados + um 5º valor também
 * independentemente arredondado não fecham contra o bruto por 1 centavo.
 */
export function calculateVendorRetentionAmountsCents(
  grossCents: Cents,
  rule: VendorRetentionRule,
): VendorRetentionAmounts {
  const inssCents = Math.round((grossCents * rule.inssBasisPoints) / 10000);
  const irrfCents = Math.round((grossCents * rule.irrfBasisPoints) / 10000);
  const csrfCents = Math.round((grossCents * rule.csrfBasisPoints) / 10000);
  const issCents = Math.round((grossCents * rule.issBasisPoints) / 10000);
  const netCents = grossCents - inssCents - irrfCents - csrfCents - issCents;

  return { inssCents, irrfCents, csrfCents, issCents, netCents };
}
