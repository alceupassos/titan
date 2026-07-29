// Seção 9.8.4 do prompt único — o checklist de virada/limpeza é ESPECIFICAÇÃO DE ESCOPO DO
// SERVIÇO (o que precisa ser verificado numa virada), nunca controle de jornada de trabalho
// (seção 9.10.6 — decisão de escopo explícita desta tarefa: a pergunta 3 de
// docs/decisoes-de-negocio.md, vínculo da camareira CLT/PJ/terceirizada, segue pendente por
// decisão do usuário, e por isso nenhum bounded context `workforce`/vínculo empregatício é
// modelado aqui). `ChecklistTemplate` é versionado (`version`, `validFrom`/`validTo`) pelo mesmo
// motivo que `TaxRule`/`AdministrationContract` são: o padrão de qualidade de uma virada muda ao
// longo do tempo, e uma virada já concluída precisa continuar auditável contra o template exato
// que estava vigente quando ela foi feita — nunca recalculada retroativamente contra a versão
// atual. Zero I/O: o conjunto de templates já carregado é responsabilidade do chamador
// (packages/db, fora de escopo deste Passo 1).
//
// I9 — importante: este arquivo INSTRUMENTA a máquina de estados da unidade
// (`unit/state-machine.ts`, já existente desde a Fase 0), nunca a substitui. `computeChecklistScore`
// não transiciona `UnitStatus` sozinho; quem chama decide o que fazer com `{ scorePercent, passed
// }` (ex.: `clean -> inspected` só se `passed === true`), mesmo espírito de `enforceAssuranceLevel`
// em `../evidence/assurance-level.ts` (bloqueia consequência, não a máquina de estados em si).
import type { CivilDate } from "@titan/dates";

/** Seção 9.8.4 — os 8 tipos de item de checklist suportados. */
export type ChecklistItemType =
  | "photo"
  | "confirm"
  | "numeric"
  | "select"
  | "text"
  | "scan"
  | "timer"
  | "signature";

/** Seção 9.8.4 — os 10 tipos de serviço cobertos por um checklist. */
export type ServiceType =
  | "limpeza_saida"
  | "limpeza_intermediaria"
  | "limpeza_profunda"
  | "dedetizacao"
  | "ar_condicionado"
  | "piscina"
  | "estofado"
  | "jardinagem"
  | "manutencao_corretiva"
  | "vistoria";

export interface ChecklistItem {
  readonly id: string;
  readonly label: string;
  /** Peso do item na pontuação ponderada — nunca negativo; itens mais críticos pesam mais sem
   * precisar ser `blocking`. */
  readonly weight: number;
  /** "Item bloqueante seletivo" (seção 9.8.4): se `true` e o item for reprovado (`passed: false`)
   * ou não respondido, reprova o checklist INTEIRO, mesmo que o score ponderado dos demais itens
   * ultrapasse `passingScore`. */
  readonly blocking: boolean;
  readonly type: ChecklistItemType;
  /** Tempo esperado de execução em segundos — referência de produtividade, opcional. */
  readonly expectedSeconds?: number;
}

export interface ChecklistSection {
  readonly id: string;
  readonly title: string;
  readonly items: readonly ChecklistItem[];
}

export interface ChecklistTemplate {
  readonly id: string;
  readonly version: number;
  readonly serviceType: ServiceType;
  readonly sections: readonly ChecklistSection[];
  /** Pontuação mínima (0-100) para o checklist ser considerado aprovado, antes de aplicar a regra
   * dos itens bloqueantes seletivos. */
  readonly passingScore: number;
  readonly validFrom: CivilDate;
  readonly validTo: CivilDate;
}

/**
 * Resposta a um item. `passed` é `undefined` quando o item não tem noção própria de
 * aprovar/reprovar (ex.: um item `type: "text"` de observação livre, ou `type: "numeric"` cujo
 * limiar de aprovação é decidido em outro lugar) — decisão de escopo: este arquivo não impõe
 * regra de "todo tipo de item precisa resultar em passed booleano"; quem constrói a resposta
 * decide se aquele item específico participa do cômputo de aprovação ou só registra um valor
 * informativo. Um item com `passed: undefined` nunca conta como aprovado no somatório ponderado
 * (só `passed === true` conta), mas também só reprova o checklist inteiro se for `blocking`.
 */
export type ChecklistItemResponse = {
  readonly itemId: string;
  readonly answered: boolean;
  readonly passed?: boolean;
  /** Planoexplica.md, Grupo D — o CONTEÚDO da resposta para itens sem noção binária de
   * aprovar/reprovar (`numeric`: quantas toalhas está levando; `text`: qual item sumiu). Nunca
   * usado por `computeChecklistScore` (só `passed` participa do cômputo) — é metadado que quem
   * consome a resposta (ex.: a tela de revisão) lê para exibir/agir, não para pontuar. */
  readonly value?: string | number;
};

export class BlockingItemUnansweredError extends Error {
  constructor(
    public readonly sectionId: string,
    public readonly itemId: string,
  ) {
    super(
      `Item bloqueante "${itemId}" da seção "${sectionId}" não tem resposta — nunca calcula ` +
        "score sem todo item bloqueante respondido (seção 9.8.4, itens bloqueantes seletivos).",
    );
    this.name = "BlockingItemUnansweredError";
  }
}

/**
 * Calcula o resultado de um checklist preenchido contra o `ChecklistTemplate` vigente no
 * momento da virada. Pura, três passos:
 *
 * 1. Todo item `blocking: true` de toda seção precisa ter uma resposta com `answered: true` no
 *    conjunto de `responses` — se faltar qualquer um, lança `BlockingItemUnansweredError` e NUNCA
 *    calcula um score "mesmo assim".
 * 2. `scorePercent` é a soma ponderada (`weight`) dos itens com `passed: true` sobre o peso total
 *    de todos os itens do template (arredondado a 2 casas decimais).
 * 3. `passed` é `scorePercent >= template.passingScore` E nenhum item bloqueante foi respondido
 *    com `passed: false` — um item bloqueante RESPONDIDO mas REPROVADO ainda reprova o checklist
 *    inteiro, mesmo que o score ponderado dos demais itens ultrapasse o mínimo ("itens bloqueantes
 *    seletivos" da seção 9.8.4: um item bloqueante não é só "obrigatório responder", é também
 *    "obrigatório passar" — do contrário a palavra "bloqueante" não faria sentido).
 */
export function computeChecklistScore(
  template: ChecklistTemplate,
  responses: readonly ChecklistItemResponse[],
): { readonly scorePercent: number; readonly passed: boolean } {
  const responseByItemId = new Map(responses.map((r) => [r.itemId, r]));

  let totalWeight = 0;
  let earnedWeight = 0;
  let hasFailedBlocking = false;

  for (const section of template.sections) {
    for (const item of section.items) {
      const response = responseByItemId.get(item.id);

      if (item.blocking && !(response?.answered === true)) {
        throw new BlockingItemUnansweredError(section.id, item.id);
      }

      totalWeight += item.weight;
      if (response?.passed === true) {
        earnedWeight += item.weight;
      }
      if (item.blocking && response?.passed === false) {
        hasFailedBlocking = true;
      }
    }
  }

  const rawScorePercent = totalWeight === 0 ? 0 : (earnedWeight / totalWeight) * 100;
  const scorePercent = Math.round(rawScorePercent * 100) / 100;
  const passed = scorePercent >= template.passingScore && !hasFailedBlocking;

  return { scorePercent, passed };
}
