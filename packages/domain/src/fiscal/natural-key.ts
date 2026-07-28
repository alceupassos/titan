// Seção 9.6 do prompt único — idempotência forte de emissão: "chave natural persistida antes da
// chamada [ao gateway], jamais duas notas para o mesmo fato gerador mesmo sob retry."
// `buildNaturalKey` é DETERMINÍSTICA e SEM I/O — a mesma chamada com os mesmos parâmetros produz
// sempre a mesma chave, nunca `crypto.randomUUID()`/`Math.random()`. É isso que permite ao banco
// (Passo 2 desta fase, `packages/db`, via `UNIQUE` sobre a coluna que guarda esta chave) recusar
// uma segunda tentativa de emissão para o mesmo fato gerador ANTES de chamar o provedor de novo —
// o gateway nunca é a fonte da chave de dedupe.
import type { CivilDate } from "@titan/dates";

/** Evento que dispara o fato gerador da nota fiscal (seção 9.6): check-out, captura de
 * pagamento, ou virada de mês em estadia longa (competência mensal). */
export type FactGeneratorEvent = "checkout" | "payment_captured" | "monthly_accrual";

export interface BuildNaturalKeyParams {
  readonly reservationId: string;
  readonly event: FactGeneratorEvent;
  readonly referenceDate: CivilDate;
}

/**
 * Constrói a chave natural do fato gerador de uma nota fiscal.
 *
 * Decisão de shape: concatenação literal e legível (`reservationId:event:referenceDate`), não um
 * hash (`sha256(...)`) da mesma tripla. Um hash esconderia a estrutura sem ganhar nada aqui — a
 * chave não precisa ter tamanho fixo, não é exposta a terceiros como segredo, e precisar
 * depurar/logar/consultar manualmente qual reserva+evento+data gerou uma UNIQUE violation é uma
 * ocorrência esperada em operação (ao contrário de, por exemplo, `entry_hash` em
 * `evidence/chain.ts`, que existe para provar integridade de uma cadeia, papel que só um hash
 * cumpre). Se no futuro a chave precisar ser opaca (ex.: não vazar `reservationId` em uma URL de
 * webhook), essa é uma decisão de infra que embrulha o resultado desta função, não uma mudança
 * aqui.
 *
 * `referenceDate` sempre entra na chave (mesmo para `checkout`, onde poderia parecer redundante
 * com `reservationId`) porque `monthly_accrual` pode gerar MÚLTIPLAS chamadas legítimas para a
 * MESMA reserva — uma por mês de competência — e cada uma precisa da sua própria chave natural.
 */
export function buildNaturalKey(params: BuildNaturalKeyParams): string {
  return `${params.reservationId}:${params.event}:${params.referenceDate}`;
}
