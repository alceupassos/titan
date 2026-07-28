// Regra dura do CLAUDE.md raiz: "alíquota, código de serviço, retenção e prazo de canal: tabela
// versionada. Nunca código." — este arquivo é o "prazo de canal" para abertura de sinistro/dossiê
// de dano (seção 9.9): cada canal (Airbnb, Booking, VRBO, Expedia, reserva direta) tem sua própria
// janela de horas após o check-out para abrir uma reclamação formal, e essa janela muda com o
// tempo (renegociação de contrato com o canal) — daí `ChannelClaimRule` versionada por vigência,
// mesmo padrão de `TaxRule` (../fiscal/tax-rule.ts) e `AdministrationContract`
// (../administration/administration-contract.ts). Zero I/O: o conjunto de regras já carregado é
// responsabilidade do chamador (packages/db, fora de escopo deste Passo 1).
//
// Decisão de shape: `channel` é o `Channel` REAL de `../reservation/state-machine.ts`, não uma
// string solta redeclarada aqui. Verificado antes de importar: `reservation/state-machine.ts` não
// importa nada de `housekeeping/` (importa só de `../fsm`, `@titan/money`, `@titan/dates`) — então
// `housekeeping -> reservation` é uma dependência unidirecional, não um ciclo. Reusar o tipo único
// é melhor que duplicar uma união literal que precisaria ser mantida sincronizada manualmente toda
// vez que um canal novo for adicionado (docs/anti-padroes.md, espírito do #5 — nunca bifurcar
// lógica/tipos por canal em lugares diferentes).
import type { CivilDate } from "@titan/dates";
import type { Channel } from "../reservation/state-machine";

export interface ChannelClaimRule {
  readonly id: string;
  readonly tenantId: string;
  readonly channel: Channel;
  /** Prazo em horas a partir do check-out para abrir o sinistro/dossiê de dano junto ao canal. */
  readonly deadlineHours: number;
  readonly validFrom: CivilDate;
  readonly validTo: CivilDate;
}

export class NoChannelClaimRuleForDateError extends Error {
  constructor(channel: Channel, date: CivilDate) {
    super(
      `Nenhuma channel_claim_rule vigente para o canal ${channel} na data ${date} — nunca aplicar ` +
        "um prazo padrão silenciosamente. Cadastre a regra vigente antes de calcular o prazo de " +
        "sinistro (docs/invariantes.md; docs/anti-padroes.md #6).",
    );
    this.name = "NoChannelClaimRuleForDateError";
  }
}

/**
 * Duas (ou mais) `ChannelClaimRule` para o MESMO canal cobrem a MESMA data — ambiguidade que
 * `resolveClaimDeadlineForChannel` recusa a resolver sozinha, mesmo padrão de
 * `OverlappingTaxRuleValidityError`/`OverlappingAdministrationContractError`. A validação
 * estrutural de vigências que não se sobrepõem (provavelmente `EXCLUDE USING gist` sobre
 * `daterange(validFrom, validTo)` particionado por canal) pertence à borda que grava a regra nova,
 * não a este pacote de domínio puro.
 */
export class OverlappingChannelClaimRuleError extends Error {
  constructor(
    channel: Channel,
    date: CivilDate,
    public readonly matchingRuleIds: readonly string[],
  ) {
    super(
      `Ambiguidade de channel_claim_rule: ${matchingRuleIds.length} regras vigentes para o canal ` +
        `${channel}, na data ${date} (ids: ${matchingRuleIds.join(", ")}) — vigências sobrepostas ` +
        "nunca são resolvidas escolhendo a primeira em silêncio; corrija o cadastro da regra de " +
        "prazo de canal.",
    );
    this.name = "OverlappingChannelClaimRuleError";
  }
}

/**
 * Resolve a `ChannelClaimRule` vigente para canal+data dentre um conjunto já carregado pelo
 * chamador (zero I/O aqui) — mesma lógica de `resolveTaxRuleForDate`/
 * `resolveAdministrationContractForDate`. Vigência é inclusiva nos dois extremos (`validFrom <=
 * date <= validTo`).
 */
export function resolveClaimDeadlineForChannel(
  rules: readonly ChannelClaimRule[],
  params: { channel: Channel; date: CivilDate },
): ChannelClaimRule {
  const { channel, date } = params;

  const matching = rules.filter(
    (rule) => rule.channel === channel && date >= rule.validFrom && date <= rule.validTo,
  );

  if (matching.length === 0) {
    throw new NoChannelClaimRuleForDateError(channel, date);
  }
  if (matching.length > 1) {
    throw new OverlappingChannelClaimRuleError(
      channel,
      date,
      matching.map((rule) => rule.id),
    );
  }
  // Não-nulo garantido pelos dois checks acima — mesmo padrão de asserção usado em
  // `fiscal/tax-rule.ts` e `administration/administration-contract.ts`.
  return matching[0]!;
}

/** Prazo final (epoch ms) para abrir o sinistro, a partir do instante do check-out real. */
export function computeClaimDeadlineEpochMs(checkoutEpochMs: number, rule: ChannelClaimRule): number {
  return checkoutEpochMs + rule.deadlineHours * 60 * 60 * 1000;
}

/**
 * `true` se o prazo ainda não venceu, mas está dentro da janela de aviso (`deadlineEpochMs -
 * nowEpochMs <= warningWindowMs`). Decisão de shape: um prazo JÁ VENCIDO não é "em risco" — é um
 * caso pior e diferente (o cockpit precisa alarmar de um jeito distinto: "risco" pede ação
 * preventiva, "vencido" já é falha registrada, provavelmente contabilizada contra o portão de
 * saída da Fase 6 — "zero prazo de sinistro perdido em simulação", docs/roadmap.md). Por isso
 * existe `isClaimDeadlineExpired` como função separada, em vez de fazer `isClaimDeadlineAtRisk`
 * também retornar `true` para o vencido: misturar os dois casos no mesmo booleano obrigaria quem
 * chama a checar `isClaimDeadlineExpired` de qualquer forma para diferenciar os casos, o que
 * anula a vantagem de ter uma função só.
 */
export function isClaimDeadlineAtRisk(
  deadlineEpochMs: number,
  nowEpochMs: number,
  warningWindowMs: number,
): boolean {
  return deadlineEpochMs > nowEpochMs && deadlineEpochMs - nowEpochMs <= warningWindowMs;
}

/** `true` se o prazo já passou (`deadlineEpochMs <= nowEpochMs`) — ver nota de `isClaimDeadlineAtRisk`. */
export function isClaimDeadlineExpired(deadlineEpochMs: number, nowEpochMs: number): boolean {
  return deadlineEpochMs <= nowEpochMs;
}
