// I2 — Toda reserva confirmada tem lastro financeiro rastreável. I3 — todo lançamento financeiro
// é imutável; correção só por lançamento de estorno, nunca por edição.
//
// `LedgerEntry` é o espelho em domínio da tabela `ledger_entries` (append-only) que o Passo 2
// desta fase cria em packages/db. Nenhuma função deste pacote "atualiza" um `LedgerEntry` — só
// existem funções que CRIAM novos lançamentos (`postDoubleEntry`), incluindo lançamentos de
// estorno que referenciam o original por `reversalOfId` (mesmo espírito de `discardEvidence` em
// packages/domain/src/evidence/chain.ts: remover é sempre um evento novo, nunca uma reescrita).
import type { CurrencyCode } from "@titan/money";

export type LedgerDirection = "debit" | "credit";

/** Centavos inteiros — mesmo significado de `Money.amountCents` em @titan/money. `LedgerEntry`
 * usa valor + moeda como campos separados (não um `Money` composto) porque espelha as colunas
 * reais de `ledger_entries` no banco (`amount_cents` + `currency` independentes) que o Passo 2
 * desta fase cria em packages/db. O chamador nunca deve passar float aqui — `postDoubleEntry`
 * valida isso em runtime (docs/anti-padroes.md #9: dinheiro nunca é float; centavos são sempre
 * inteiros). */
export type Cents = number;

export interface LedgerEntry {
  readonly id: string;
  readonly tenantId: string;
  readonly accountId: string;
  readonly direction: LedgerDirection;
  readonly amountCents: Cents;
  readonly currency: CurrencyCode;
  readonly reservationId?: string;
  /** Presente só em lançamentos de estorno — referencia o `id` do `LedgerEntry` original que
   * está sendo corrigido (I3). Nunca aponta para um outro estorno em cadeia neste pacote; a regra
   * de "estorno de estorno" fica para quando isso vier a ser necessário, fora de escopo aqui. */
  readonly reversalOfId?: string;
  /** epoch ms — injetado pelo chamador, nunca `Date.now()` dentro do domínio. */
  readonly createdAt: number;
}
