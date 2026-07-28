// Fase 5 (Financeiro), Passo 1 — docs/decisoes-de-negocio.md, pergunta 4 (contrato de
// administração, confirmada): comissão da Titan é sempre um percentual fixo sobre a receita BRUTA
// de hospedagem (nunca líquida), mas os itens operacionais (limpeza/enxoval/manutenção/amenities)
// são configuráveis POR PROPRIETÁRIO — "Titan paga tudo, embutido na comissão" OU "proprietário
// paga, Titan rateia e desconta do repasse" — nunca um modelo único global. `AdministrationContract`
// é essa configuração por unidade, versionada por vigência: mesmo espírito de `TaxRule` em
// `packages/domain/src/fiscal/tax-rule.ts` (regra dura do CLAUDE.md raiz — "alíquota, código de
// serviço, retenção e prazo de canal: tabela versionada, nunca código" — o mesmo vale aqui para o
// percentual de comissão e o modelo de pagamento de itens, que nunca devem virar constante de
// código). Zero I/O: o conjunto de contratos já carregado é responsabilidade do chamador
// (packages/db, fora de escopo deste Passo 1).
import type { CivilDate } from "@titan/dates";

/**
 * `"titan_pays_all"`: itens operacionais entram no custo da Titan, cobertos pela comissão sobre a
 * receita bruta — o proprietário nunca vê uma linha de despesa itemizada no extrato de repasse.
 * `"owner_pays_itemized"`: itens operacionais são rateados e descontados do repasse do
 * proprietário, linha a linha (ver `PayoutExtractLineItem` em `payout-extract.ts`).
 */
export type ItemPaymentModel = "titan_pays_all" | "owner_pays_itemized";

/**
 * Contrato de administração vigente para uma unidade — a fonte de verdade de quanto a Titan
 * retém (comissão) e de quem paga os itens operacionais. Uma unidade pode trocar de contrato ao
 * longo do tempo (renegociação), daí `validFrom`/`validTo` — nunca uma única linha mutável.
 */
export interface AdministrationContract {
  readonly id: string;
  readonly tenantId: string;
  readonly unitId: string;
  /** Comissão em pontos-base inteiros sobre a receita BRUTA — ex.: 2000 = 20,00%. Nunca float,
   * mesmo espírito de `aliquotBasisPoints` em `packages/domain/src/fiscal/tax-rule.ts`: um
   * percentual como `0.20` sofre os mesmos problemas de arredondamento binário que dinheiro
   * representado como float (docs/anti-padroes.md #9). */
  readonly commissionBasisPoints: number;
  readonly itemPaymentModel: ItemPaymentModel;
  readonly validFrom: CivilDate;
  readonly validTo: CivilDate;
}

export class NoAdministrationContractForDateError extends Error {
  constructor(unitId: string, date: CivilDate) {
    super(
      `Nenhum administration_contract vigente para a unidade ${unitId} na data ${date} — nunca ` +
        "aplicar comissão ou modelo de pagamento de itens padrão silenciosamente. Cadastre o " +
        "contrato de administração vigente antes de calcular o repasse (docs/decisoes-de-" +
        "negocio.md, pergunta 4).",
    );
    this.name = "NoAdministrationContractForDateError";
  }
}

/**
 * Duas (ou mais) `AdministrationContract` para a MESMA unidade cobrem a MESMA data — ambiguidade
 * que `resolveAdministrationContractForDate` recusa a resolver sozinha (nunca escolhe "o
 * primeiro" silenciosamente). Mesmo raciocínio de `OverlappingTaxRuleValidityError` em
 * `tax-rule.ts`: a validação estrutural de vigências que não se sobrepõem pertence à borda que
 * grava o contrato novo (provavelmente `EXCLUDE USING gist` sobre `daterange(validFrom,
 * validTo)` particionado por `unitId`, mesmo padrão de I1/tax_rule) — aqui a ambiguidade só é
 * DETECTADA reativamente, no momento em que alguém pede o contrato vigente para uma data
 * específica.
 */
export class OverlappingAdministrationContractError extends Error {
  constructor(
    unitId: string,
    date: CivilDate,
    public readonly matchingContractIds: readonly string[],
  ) {
    super(
      `Ambiguidade de administration_contract: ${matchingContractIds.length} contratos vigentes ` +
        `para a unidade ${unitId} na data ${date} (ids: ${matchingContractIds.join(", ")}) — ` +
        "vigências sobrepostas nunca são resolvidas escolhendo a primeira em silêncio; corrija o " +
        "cadastro do contrato de administração.",
    );
    this.name = "OverlappingAdministrationContractError";
  }
}

/**
 * Resolve o `AdministrationContract` vigente para unidade+data dentre um conjunto já carregado
 * pelo chamador (zero I/O aqui) — mesma lógica de `resolveTaxRuleForDate`. Vigência é inclusiva
 * nos dois extremos (`validFrom <= date <= validTo`); comparação lexicográfica funciona porque
 * `CivilDate` é sempre "YYYY-MM-DD". Lança `NoAdministrationContractForDateError` se nenhum
 * contrato cobrir a data, e `OverlappingAdministrationContractError` se mais de um cobrir — nunca
 * escolhe silenciosamente.
 */
export function resolveAdministrationContractForDate(
  contracts: readonly AdministrationContract[],
  params: { unitId: string; date: CivilDate },
): AdministrationContract {
  const { unitId, date } = params;

  const matching = contracts.filter(
    (contract) => contract.unitId === unitId && date >= contract.validFrom && date <= contract.validTo,
  );

  if (matching.length === 0) {
    throw new NoAdministrationContractForDateError(unitId, date);
  }
  if (matching.length > 1) {
    throw new OverlappingAdministrationContractError(
      unitId,
      date,
      matching.map((contract) => contract.id),
    );
  }
  // Não-nulo garantido pelos dois checks acima — mesmo padrão de asserção usado em
  // `fiscal/tax-rule.ts` e `channel/reconciliation.ts`.
  return matching[0]!;
}
