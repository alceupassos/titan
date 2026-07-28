// I7 — Documento fiscal emitido não é editável; apenas cancelado/substituído. Este arquivo
// define o SHAPE de entrada/saída da emissão de nota fiscal (seção 9.6 do prompt único:
// `ServiceInvoiceInput`), zero I/O — a chamada real ao provedor (Focus NFe) é uma faixa
// posterior (`packages/fiscal`, fora de escopo do Passo 1).
import type { CurrencyCode } from "@titan/money";
import type { Cents } from "../ledger/ledger-entry";

/** Código de município IBGE, ex.: "3550308" = São Paulo. Tipo genérico (string), não uma union
 * fechada — nesta fase só São Paulo tem `tax_rule` cadastrada (ver tax-rule.ts), mas o tipo não
 * deve travar quando o segundo município for cadastrado; a restrição real é a tabela versionada
 * de `TaxRule`, nunca o tipo TypeScript. */
export type MunicipalityCode = string;

/**
 * Dados de entrada para emitir uma nota de serviço — espelha `ServiceInvoiceInput` da seção 9.6
 * do prompt único. `taxAmountCents` já vem CALCULADO pelo chamador (via
 * `calculateTaxAmountCents`, a partir de uma `TaxRule` resolvida para a data do fato gerador) —
 * este tipo não recalcula imposto, só carrega o valor já decidido, junto da base que o originou,
 * para o provedor e para o registro fiscal auditável.
 */
export interface ServiceInvoiceInput {
  readonly reservationId: string;
  readonly municipalityCode: MunicipalityCode;
  readonly serviceCode: string;
  readonly baseAmountCents: Cents;
  readonly currency: CurrencyCode;
  readonly taxAmountCents: Cents;
  /** Nome da Titan — prestadora do serviço de hospedagem (docs/decisoes-de-negocio.md, pergunta
   * 2, confirmada: a Titan emite, não o proprietário). */
  readonly issuerName: string;
  /** CPF/CNPJ do hóspede — tomador do serviço. */
  readonly takerDocument: string;
  readonly description: string;
}

/** Retorno de uma emissão bem-sucedida junto ao provedor — `raw` preserva o payload original
 * (auditoria/depuração), `externalInvoiceId` é o id que o provedor atribui, `naturalKey` é a
 * mesma chave determinística que autorizou a chamada (ver natural-key.ts), persistida junto do
 * resultado para permitir reconciliação sem depender só do id externo. */
export interface IssuedInvoice {
  readonly externalInvoiceId: string;
  readonly naturalKey: string;
  readonly issuedAtEpochMs: number;
  readonly xmlUrl?: string;
  readonly pdfUrl?: string;
  readonly raw: unknown;
}

/**
 * Status do PROCESSO/PEDIDO de emissão — usado pelo worker/fila (Passo 4b desta fase, fora de
 * escopo aqui) para rastrear uma tentativa de emitir, do enfileiramento até a resposta do
 * provedor (ou a falta dela). Inclui `pending` e `rejected`, que não fazem sentido em
 * `FiscalDocumentStatus` (`../fiscal-document/state-machine.ts`).
 *
 * Distinção importante entre os dois tipos de status, para não confundir os dois no resto do
 * pacote fiscal:
 * - `InvoiceStatus` (aqui): status do PEDIDO de emissão — existe mesmo ANTES de qualquer
 *   documento fiscal existir de fato (`pending` = na fila, ainda nem chamou o provedor;
 *   `rejected` = o provedor recusou, nenhum documento foi criado). É o worker que faz a chamada
 *   de rede que faz esse status andar.
 * - `FiscalDocumentStatus` (`../fiscal-document/state-machine.ts`, `draft → issued →
 *   cancelled|substituted`): status do DOCUMENTO fiscal já existente, depois que a emissão deu
 *   certo — é aqui que I7 (imutabilidade pós-emissão) se aplica. Um pedido em `InvoiceStatus =
 *   "issued"` corresponde a um `FiscalDocumentStatus = "issued"`; um pedido `"rejected"` nunca
 *   chega a ter um `FiscalDocumentStatus` associado, porque nenhum documento foi criado.
 */
export type InvoiceStatus = "pending" | "issued" | "rejected" | "cancelled" | "substituted";
