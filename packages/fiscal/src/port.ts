// Porta comum de gateway fiscal (Fase 4, Passo 4a — docs/fase-atual.md). Mesmo espírito de
// `packages/payments/src/port.ts`: o resto da aplicação (worker de emissão, Server Actions do
// cockpit em `(staff)/fiscal`, faixas paralelas) depende só deste shape, nunca do provedor
// concreto por trás — anti-padrão #5 do prompt único ("if canal === 'x' espalhado"), aplicado
// aqui a provedor fiscal em vez de canal de distribuição. ADR-0006: via 3 (provedor
// intermediário) para o MVP — Focus NFe é o primeiro (e, por ora, único) adapter concreto
// (`focus-nfe/adapter.ts`), faixa paralela a este arquivo.
//
// I7 — documento fiscal emitido não é editável, só cancelado/substituído: por isso não existe
// `update()`/`edit()` nesta interface, só `issue`/`cancel`/`substitute`. A imposição forte de I7
// é `packages/domain/src/fiscal-document/state-machine.ts` (`assertNotEditingIssuedDocument`),
// não este port — o port só reflete a mesma forma para não oferecer um método que a aplicação
// não deveria chamar.
//
// Idempotência forte (seção 9.6 do prompt único / docs/invariantes.md): "chave natural
// persistida antes da chamada ao gateway, jamais duas notas para o mesmo fato gerador mesmo sob
// retry." A `naturalKey` (`packages/domain/src/fiscal/natural-key.ts`, `buildNaturalKey`) já foi
// CALCULADA e PERSISTIDA no banco (coluna UNIQUE, `packages/db/migrations/0005_fiscal.sql`) antes
// desta faixa ser chamada — isso é responsabilidade de quem enfileira a emissão (Passo 4b,
// `apps/worker`, faixa paralela), não deste port nem do adapter. Por isso `issue`/`substitute`
// recebem `naturalKey` como parâmetro EXPLÍCITO em vez de derivá-la internamente: o gateway nunca
// gera essa chave sozinho, só a usa como referência de idempotência na chamada ao provedor
// concreto (no Focus NFe, isso vira o `ref` da URL do recurso — ver TODO em
// `focus-nfe/adapter.ts` sobre o comportamento exato assumido, não confirmado contra a doc viva).
import type { IssuedInvoice, ServiceInvoiceInput } from "@titan/domain";

/** Status de PROCESSAMENTO devolvido por `query()` — vocabulário do PROVEDOR (ex.: Focus NFe
 * responde de forma assíncrona: "processando_autorizacao", "autorizado", "erro_autorizacao",
 * "cancelado"), propositalmente NÃO normalizado para `InvoiceStatus`
 * (`packages/domain/src/fiscal/service-invoice.ts`) aqui no port — essa tradução
 * provedor->vocabulário comum é responsabilidade de quem CONSOME `query()` (o worker, Passo 4b),
 * do mesmo jeito que `packages/payments/src/port.ts` deixa `raw` como payload cru e deixa quem
 * consome mapear status. Mantido como `string` solto de propósito, não uma union fechada, porque
 * cada provedor concreto (só Focus NFe agora, mas a porta é para múltiplos) tem seu próprio
 * catálogo de status. */
export interface FiscalInvoiceStatusQuery {
  readonly status: string;
  readonly detail?: string;
}

/** Retorno de `cancel()` — `ok: false` cobre o caso em que o provedor recusa o cancelamento (ex.:
 * prazo de cancelamento espontâneo da NFS-e municipal já expirado), que é um resultado de negócio
 * esperado, não uma exceção de rede. */
export interface CancelInvoiceResult {
  readonly ok: boolean;
  readonly detail?: string;
}

export interface FiscalGateway {
  /**
   * Emite uma nota de serviço. Idempotente por `naturalKey`: chamar `issue` duas vezes com a
   * mesma `naturalKey` e o mesmo `input` não deve produzir duas notas — o comportamento exato
   * (o provedor devolve a nota já existente vs. rejeita a segunda chamada) é do PROVEDOR
   * concreto, documentado (com incerteza real onde houver) em cada adapter, nunca inventado
   * aqui no port.
   *
   * Emissão de NFS-e é tipicamente ASSÍNCRONA no provedor (Focus NFe processa em fila própria) —
   * o retorno de `issue` pode não significar "nota autorizada", só "pedido aceito para
   * processamento". Quem chama precisa consultar `query()` para saber o status final; ver
   * `InvoiceStatus` (`@titan/domain`) para o vocabulário de pedido vs. documento.
   */
  issue(input: ServiceInvoiceInput, naturalKey: string): Promise<IssuedInvoice>;

  /** Cancela uma nota já emitida. Nunca "edita" — I7. `reason` é obrigatório porque cancelamento
   * sem motivo registrado é o mesmo anti-padrão #13 (docs/anti-padroes.md) aplicado a documento
   * fiscal em vez de checklist de limpeza: toda reprovação/cancelamento aponta uma causa
   * específica. */
  cancel(externalInvoiceId: string, reason: string): Promise<CancelInvoiceResult>;

  /**
   * Substitui uma nota já emitida por uma nova (I7: "apenas cancelado/substituído" — nunca
   * editado in-place). `naturalKey` aqui é a chave da NOVA emissão (o fato gerador da
   * substituição), distinta da chave da nota original que está sendo substituída — mesma razão
   * de `naturalKey` ser explícito em `issue`: quem chama já persistiu essa chave nova antes de
   * chamar.
   */
  substitute(externalInvoiceId: string, input: ServiceInvoiceInput, naturalKey: string): Promise<IssuedInvoice>;

  /** Consulta o status de processamento de uma nota no provedor — necessário porque `issue`
   * tipicamente não é síncrono (ver acima). */
  query(externalInvoiceId: string): Promise<FiscalInvoiceStatusQuery>;

  /** Busca o PDF (DANFSE ou equivalente municipal) de uma nota já autorizada. */
  fetchPdf(externalInvoiceId: string): Promise<Buffer>;

  /** Busca o XML assinado de uma nota já autorizada — fonte de verdade fiscal, preservado no
   * cofre WORM (Fase 4, escopo do Passo 2/3, fora desta faixa). */
  fetchXml(externalInvoiceId: string): Promise<string>;
}

/** Lançado por um adapter quando o provedor concreto responde de um jeito que o resto da
 * aplicação não deveria tentar interpretar silenciosamente (ex.: corpo de erro em formato
 * inesperado) — falha alto em vez de mascarar, mesmo espírito de
 * `packages/payments/src/asaas/adapter.ts` (`mapPaymentStatus`/`mapWebhookEvent`, que lançam em
 * vez de assumir um valor "seguro"). */
export class FiscalGatewayError extends Error {
  constructor(
    public readonly provider: string,
    reason: string,
  ) {
    super(`Erro no gateway fiscal '${provider}': ${reason}`);
    this.name = "FiscalGatewayError";
  }
}
