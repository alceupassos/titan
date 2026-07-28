// I10 — seção 9.9 do prompt único: cada consequência FINANCEIRA que uma evidência fotográfica
// destrava exige um nível mínimo de garantia (`AssuranceLevel`, já definido em `./chain.ts` — não
// redeclarado aqui, só reimportado/reexportado). Regra dura desta seção, textual: "não bloqueia o
// trabalho, bloqueia só a consequência financeira" — ou seja, `enforceAssuranceLevel` NUNCA impede
// a operação em si (ex.: a camareira sempre pode declarar limpeza concluída, o supervisor sempre
// pode inspecionar) — ela só recusa a ação que gera dinheiro (liberar unidade para venda, cobrar
// enxoval, reter caução, abrir sinistro de canal, descontar prestador) quando a evidência
// disponível não sustenta essa consequência. Zero I/O: quem chama decide o que fazer com o erro
// (pedir reinspeção, bloquear o botão no cockpit, etc.) — este arquivo só compara níveis.
import type { AssuranceLevel } from "./chain";

export type { AssuranceLevel } from "./chain";

/**
 * As 6 consequências financeiras da tabela da seção 9.9 mapeadas 1:1 (nenhuma fusão foi
 * necessária — a tabela original já lista exatamente 6 linhas com consequência financeira: (1)
 * liberar a unidade para `ready`/venda, (2) reprovar o serviço e não liberar pagamento de OS ao
 * prestador, (3) cobrar peça de enxoval da lavanderia, (4) reter caução do hóspede, (5) abrir
 * sinistro/dossiê contra o canal, (6) cobrar ou descontar o prestador por dano/serviço mal feito).
 * "Comprovar execução e liberar pagamento de OS" e "reprovar serviço" são modeladas como duas
 * consequências distintas (`release_ready`-adjacent via `reprove_service` e `charge_vendor`) em
 * vez de fundidas, porque uma reprovação pode acontecer sem nenhuma cobrança a prestador (serviço
 * interno, sem terceirizado) e uma cobrança a prestador pode acontecer sem reprovação formal do
 * checklist (dano constatado fora do fluxo de inspeção) — tratar como o mesmo enum perderia essa
 * distinção sem ganhar nada em troca.
 */
export type FinancialConsequence =
  | "release_ready"
  | "reprove_service"
  | "charge_linen"
  | "withhold_deposit"
  | "channel_claim"
  | "charge_vendor";

/**
 * Tabela ÚNICA e central (docs/anti-padroes.md #6 em espírito: nível mínimo de garantia nunca é
 * hardcoded disperso pelo código, sempre lido daqui). Conforme a leitura da seção 9.9: liberar a
 * unidade, reprovar o serviço e cobrar enxoval exigem só A1 (evidência básica, sem necessidade de
 * app instalado); reter caução, abrir sinistro contra canal e cobrar/descontar prestador — as três
 * consequências que geram disputa com um terceiro externo à Titan (hóspede, OTA, prestador) —
 * exigem A2 (vistoria capturada em app instalado, maior garantia de proveniência).
 */
export const MINIMUM_ASSURANCE_BY_CONSEQUENCE: Record<FinancialConsequence, AssuranceLevel> = {
  release_ready: "A1",
  reprove_service: "A1",
  charge_linen: "A1",
  withhold_deposit: "A2",
  channel_claim: "A2",
  charge_vendor: "A2",
};

const ASSURANCE_ORDER: Record<AssuranceLevel, number> = { A0: 0, A1: 1, A2: 2, A3: 3 };

export class InsufficientAssuranceLevelError extends Error {
  constructor(
    public readonly consequence: FinancialConsequence,
    public readonly level: AssuranceLevel,
    public readonly minimumRequired: AssuranceLevel,
  ) {
    super(
      `Esta consequência (${consequence}) exige nível mínimo de garantia ${minimumRequired}, ` +
        `evidência está em ${level} — solicite reinspeção capturada em app instalado com nível ` +
        "suficiente antes de confirmar esta ação financeira (docs/invariantes.md, I10; seção 9.9 " +
        "do prompt único).",
    );
    this.name = "InsufficientAssuranceLevelError";
  }
}

/**
 * I10 em função pura: NUNCA bloqueia o trabalho operacional (limpar, inspecionar, declarar
 * concluído) — só a consequência FINANCEIRA associada. Lança `InsufficientAssuranceLevelError`
 * se o nível de garantia disponível for insuficiente para a consequência pedida; não retorna
 * nada em caso de sucesso (mesmo padrão de `assertNotEditingIssuedDocument` no pacote
 * fiscal-document).
 */
export function enforceAssuranceLevel(level: AssuranceLevel, consequence: FinancialConsequence): void {
  const minimumRequired = MINIMUM_ASSURANCE_BY_CONSEQUENCE[consequence];
  if (ASSURANCE_ORDER[level] < ASSURANCE_ORDER[minimumRequired]) {
    throw new InsufficientAssuranceLevelError(consequence, level, minimumRequired);
  }
}
