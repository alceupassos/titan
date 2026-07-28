// Fase 3 — comparação pura entre o estado local (fonte de verdade do Titan) e o estado que um
// canal externo reporta, para `availability` e `rate`. Nenhuma destas funções faz I/O: recebem
// dois snapshots já carregados (local e remoto) e devolvem a lista de `Divergence` — quem busca
// os snapshots e quem age sobre a divergência (reenviar, alertar) é o adapter/serviço chamador,
// fora de escopo deste pacote.
//
// Decisão de shape: `AvailabilitySnapshot` tem a MESMA forma estrutural de `CalendarDelta`
// (unitId + date + blocked), mas é um tipo próprio, não um alias/reuso direto — `CalendarDelta`
// representa uma MUDANÇA a empurrar para o canal (semântica de comando/evento), enquanto
// `AvailabilitySnapshot` representa o ESTADO observado num ponto no tempo (semântica de leitura,
// local ou remoto). Colapsar os dois no mesmo tipo economizaria uma interface, mas confundiria
// "isto é o que vou mandar" com "isto é o que existe agora" em qualquer assinatura que os
// misture — o custo de manter dois tipos estruturalmente iguais é menor que esse risco de leitura
// errada num pacote que decide o que é ou não uma divergência financeira/operacional real.
import type { CivilDate } from "@titan/dates";
import type { Money } from "@titan/money";
import type { Channel } from "../reservation/state-machine";
import type { Divergence } from "./divergence";

export interface AvailabilitySnapshot {
  readonly unitId: string;
  readonly date: CivilDate;
  readonly blocked: boolean;
}

export interface RateSnapshot {
  readonly unitId: string;
  readonly date: CivilDate;
  readonly priceAmount: Money;
}

interface ReconciliationParams {
  readonly channel: Channel;
  readonly nowEpochMs: number;
}

function keyOf(unitId: string, date: CivilDate): string {
  return `${unitId}::${date}`;
}

/**
 * Compara disponibilidade local (fonte de verdade) com o que o canal externo reporta. Cada
 * dia (unitId + date) presente em pelo menos um dos dois lados é avaliado; ausência de um lado
 * conta como divergência (o dado não deveria faltar de nenhum dos dois lados numa reconciliação
 * saudável). Snapshots idênticos → lista vazia.
 */
export function detectAvailabilityDrift(
  local: readonly AvailabilitySnapshot[],
  remote: readonly AvailabilitySnapshot[],
  params: ReconciliationParams,
): Divergence[] {
  const localByKey = new Map(local.map((s) => [keyOf(s.unitId, s.date), s]));
  const remoteByKey = new Map(remote.map((s) => [keyOf(s.unitId, s.date), s]));
  const allKeys = new Set([...localByKey.keys(), ...remoteByKey.keys()]);

  const divergences: Divergence[] = [];
  for (const key of allKeys) {
    const localEntry = localByKey.get(key);
    const remoteEntry = remoteByKey.get(key);

    if (!localEntry || !remoteEntry) {
      const present = localEntry ?? remoteEntry!;
      divergences.push({
        unitId: present.unitId,
        channel: params.channel,
        kind: "availability_mismatch",
        date: present.date,
        detail: {
          reason: "missing_on_one_side",
          missingSide: localEntry ? "remote" : "local",
        },
        detectedAtEpochMs: params.nowEpochMs,
      });
      continue;
    }

    if (localEntry.blocked !== remoteEntry.blocked) {
      divergences.push({
        unitId: localEntry.unitId,
        channel: params.channel,
        kind: "availability_mismatch",
        date: localEntry.date,
        detail: { localBlocked: localEntry.blocked, remoteBlocked: remoteEntry.blocked },
        detectedAtEpochMs: params.nowEpochMs,
      });
    }
  }

  return divergences;
}

/**
 * Compara tarifa local com o que o canal externo reporta, por dia. Divergência de moeda conta
 * como divergência tão real quanto divergência de valor — comparar só `amountCents` sem checar
 * `currency` deixaria passar um erro grave de conversão sem detecção.
 */
export function detectRateDrift(
  local: readonly RateSnapshot[],
  remote: readonly RateSnapshot[],
  params: ReconciliationParams,
): Divergence[] {
  const localByKey = new Map(local.map((s) => [keyOf(s.unitId, s.date), s]));
  const remoteByKey = new Map(remote.map((s) => [keyOf(s.unitId, s.date), s]));
  const allKeys = new Set([...localByKey.keys(), ...remoteByKey.keys()]);

  const divergences: Divergence[] = [];
  for (const key of allKeys) {
    const localEntry = localByKey.get(key);
    const remoteEntry = remoteByKey.get(key);

    if (!localEntry || !remoteEntry) {
      const present = localEntry ?? remoteEntry!;
      divergences.push({
        unitId: present.unitId,
        channel: params.channel,
        kind: "rate_mismatch",
        date: present.date,
        detail: {
          reason: "missing_on_one_side",
          missingSide: localEntry ? "remote" : "local",
        },
        detectedAtEpochMs: params.nowEpochMs,
      });
      continue;
    }

    const currencyDiverges = localEntry.priceAmount.currency !== remoteEntry.priceAmount.currency;
    const amountDiverges = localEntry.priceAmount.amountCents !== remoteEntry.priceAmount.amountCents;

    if (currencyDiverges || amountDiverges) {
      divergences.push({
        unitId: localEntry.unitId,
        channel: params.channel,
        kind: "rate_mismatch",
        date: localEntry.date,
        detail: {
          localAmountCents: localEntry.priceAmount.amountCents,
          localCurrency: localEntry.priceAmount.currency,
          remoteAmountCents: remoteEntry.priceAmount.amountCents,
          remoteCurrency: remoteEntry.priceAmount.currency,
        },
        detectedAtEpochMs: params.nowEpochMs,
      });
    }
  }

  return divergences;
}
