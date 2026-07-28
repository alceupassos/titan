// Job BullMQ de emissão fiscal assíncrona (Fase 4, Passo 4b — docs/fase-atual.md). Roda fora do
// enfileiramento (`../fiscal-queue.ts`), mesmo espírito de separação de `process-webhook.ts`
// (Fase 2) e `process-channel-sync.ts` (Fase 3). Fluxo, na ordem:
//
//   a. Calcula a `naturalKey` (determinística, `buildNaturalKey`, `@titan/domain`).
//   b. Resolve a `tax_rule` vigente (`findActiveTaxRule`) e calcula o imposto ANTES do INSERT
//      idempotente — DESVIO DELIBERADO da ordem literal do briefing da tarefa (que colocava o
//      insert antes da resolução da tax_rule). Motivo: `fiscal_documents.tax_amount_cents` é
//      `NOT NULL` no banco (packages/db/src/schema/fiscal-document.ts) — inserir a linha ANTES
//      de conhecer o valor real do imposto exigiria um placeholder (`0`) e uma correção posterior,
//      deixando uma janela em que a linha existe com um valor de imposto inventado. Resolver a
//      tax_rule é uma leitura de BANCO, não uma chamada de REDE ao provedor fiscal — o gate de
//      idempotência forte (INSERT idempotente) existe para proteger a chamada de rede cara e
//      não-repetível, não uma consulta interna. `NoTaxRuleForDateError`/
//      `OverlappingTaxRuleValidityError` propagam sem serem capturadas aqui — "propaga
//      corretamente" por instrução da tarefa — e, por construção desta ordem, NENHUM
//      `fiscal_document` chega a ser criado quando isso acontece (a outra opção oferecida pela
//      tarefa, "documento criado com status de erro", foi preterida por evitar o placeholder
//      acima).
//   c. `insertFiscalDocumentIfNew` — a âncora de idempotência forte. Se a linha já existir com um
//      status TERMINAL (`issued`/`rejected`/`cancelled`/`substituted`), loga e RETORNA sem chamar
//      o gateway — prova de que retry/duplicidade de enfileiramento nunca produz duas notas para
//      o mesmo fato gerador (seção 9.6). Se a linha já existir mas ainda `pending` (uma tentativa
//      anterior foi interrompida por falha de rede/timeout/processo morto antes de concluir),
//      trata como uma continuação legítima: seguen para chamar o gateway de novo reusando a MESMA
//      linha — nunca cria uma segunda. Isto é uma decisão de design ALÉM do texto literal da
//      tarefa (que descrevia só "já existe -> nunca chama o gateway de novo"): sem essa distinção
//      por status, o coalescing de `jobId = naturalKey` faria o BullMQ reprocessar o MESMO job em
//      retry, mas o passo (c) encontraria "already_exists" incondicionalmente e o retry nunca
//      chegaria a chamar o gateway de verdade — quebrando o próprio mecanismo de retry de falha
//      de rede exigido pelo passo (d).
//   d. Monta `ServiceInvoiceInput` e chama `FiscalGateway.issue`. Sucesso -> `updateFiscalDocumentIssued`.
//      Falha: `FiscalGatewayRejectionError` (rejeição de NEGÓCIO do provedor — CPF inválido, por
//      exemplo, nunca fica válido numa segunda tentativa idêntica) marca `rejected` e NÃO relança.
//      Qualquer outro erro é tratado como falha transitória de REDE/infra — logado e RELANÇADO
//      para o BullMQ decidir retry/backoff/DLQ (`../fiscal-queue.ts`), nunca decidido aqui dentro.
import { buildNaturalKey, calculateTaxAmountCents, type ServiceInvoiceInput } from "@titan/domain";
import type { TenantContext } from "@titan/db";
import { civilDate } from "@titan/dates";
import type { CurrencyCode } from "@titan/money";
import type { FiscalGateway } from "@titan/fiscal";
import type { FiscalRepo } from "../fiscal-repo";
import type { FiscalIssuanceJobPayload } from "../fiscal-queue";

/**
 * Rejeição de NEGÓCIO do provedor fiscal (CPF/CNPJ do tomador inválido, campo obrigatório
 * ausente, serviço não habilitado no certificado etc.) — nunca vai se resolver sozinha numa
 * segunda tentativa idêntica, ao contrário de um timeout de rede. Classe própria DESTE worker,
 * não de `@titan/fiscal/port.ts` (Fase 4, Passo 4a) — o port real só expõe `FiscalGatewayError`
 * para falha de PROVEDOR (resposta HTTP inesperada), e o adapter Focus NFe real
 * (`packages/fiscal/src/focus-nfe/adapter.ts`) hoje só lança essa classe, nunca esta.
 *
 * DÍVIDA TÉCNICA documentada (não escondida): com o adapter Focus NFe real, `issue()` é
 * tipicamente ASSÍNCRONO no provedor — uma rejeição de negócio de verdade só aparece depois, via
 * `FiscalGateway.query()` (não chamado por este job nesta fase). Ou seja, `FiscalGatewayRejectionError`
 * está definida e testada aqui, mas **nenhum caminho real do adapter atual a lança** — é um hook
 * para quando este job passar a fazer polling de `query()` e traduzir um status de rejeição do
 * provedor para esta exceção. Até lá, toda falha de `issue()` cai no ramo de "falha de rede/infra"
 * abaixo (relançada para retry/backoff/DLQ), mesmo que seja, na prática, uma rejeição de negócio
 * que um retry não vai resolver — comportamento correto por precaução (nunca decidir "isso é
 * definitivo" sem confirmação do provedor via `query()`), mas menos eficiente que o ideal.
 */
export class FiscalGatewayRejectionError extends Error {
  constructor(
    reason: string,
    public readonly providerDetail?: unknown,
  ) {
    super(`Rejeição de negócio do provedor fiscal: ${reason}`);
    this.name = "FiscalGatewayRejectionError";
  }
}

export interface ProcessIssueFiscalDocumentDeps {
  repo: FiscalRepo;
  gateway: FiscalGateway;
  /** Nome da prestadora emissora — Titan Empreendimentos (docs/decisoes-de-negocio.md, pergunta 2,
   * confirmada: a Titan emite, não o proprietário). Configurável para não hardcodar em dois
   * lugares se o nome legal mudar; default abaixo cobre o caso comum. */
  issuerName?: string;
  logger?: Pick<Console, "log" | "error" | "warn">;
}

const DEFAULT_ISSUER_NAME = "Titan Empreendimentos";

/** `true` quando a linha já resolvida (`already_exists`) está num status TERMINAL — a emissão
 * para este fato gerador já foi decidida (com sucesso ou rejeição definitiva) e não deve ser
 * tentada de novo. `"pending"` NÃO é terminal: significa que uma tentativa anterior foi
 * interrompida antes de concluir, e esta execução deve retomar chamando o gateway. */
function isTerminalStatus(status: string): boolean {
  return status !== "pending";
}

export async function issueFiscalDocumentJob(payload: FiscalIssuanceJobPayload, deps: ProcessIssueFiscalDocumentDeps): Promise<void> {
  const log = deps.logger ?? console;
  const ctx: TenantContext = { tenantId: payload.tenantId, actorId: `fiscal-issuance:${payload.event}` };
  const referenceDate = civilDate(payload.referenceDateISO);

  const naturalKey = buildNaturalKey({
    reservationId: payload.reservationId,
    event: payload.event,
    referenceDate,
  });

  // Passo (b) — ver nota de topo sobre a ordem: resolve ANTES do insert idempotente. Deixa
  // NoTaxRuleForDateError/OverlappingTaxRuleValidityError propagarem sem captura.
  const taxRule = await deps.repo.findActiveTaxRule(ctx, {
    municipalityCode: payload.municipalityCode,
    serviceCode: payload.serviceCode,
    dateISO: payload.referenceDateISO,
  });
  const taxAmountCents = calculateTaxAmountCents(payload.baseAmountCents, taxRule);

  // Passo (c) — âncora de idempotência forte, ANTES de qualquer chamada de rede ao gateway.
  const insertResult = await deps.repo.insertFiscalDocumentIfNew(ctx, {
    reservationId: payload.reservationId,
    naturalKey,
    municipalityCode: payload.municipalityCode,
    serviceCode: payload.serviceCode,
    baseAmountCents: payload.baseAmountCents,
    taxAmountCents,
    currency: payload.currency,
  });

  if (insertResult.kind === "already_exists" && isTerminalStatus(insertResult.status)) {
    log.log(
      `[worker] fiscal-issuance: natural_key="${naturalKey}" já resolvido (fiscal_document ` +
        `${insertResult.id}, status "${insertResult.status}") — idempotência forte, gateway NÃO chamado de novo.`,
    );
    return;
  }

  const documentId = insertResult.id;

  const input: ServiceInvoiceInput = {
    reservationId: payload.reservationId,
    municipalityCode: payload.municipalityCode,
    serviceCode: payload.serviceCode,
    baseAmountCents: payload.baseAmountCents,
    currency: payload.currency as CurrencyCode,
    taxAmountCents,
    issuerName: deps.issuerName ?? DEFAULT_ISSUER_NAME,
    takerDocument: payload.takerDocument,
    description: payload.description,
  };

  // Passo (d).
  try {
    const issued = await deps.gateway.issue(input, naturalKey);
    await deps.repo.updateFiscalDocumentIssued(ctx, documentId, issued);
    log.log(
      `[worker] fiscal-issuance: nota emitida (fiscal_document ${documentId}, reserva ${payload.reservationId}, ` +
        `external_invoice_id=${issued.externalInvoiceId}).`,
    );
  } catch (err) {
    if (err instanceof FiscalGatewayRejectionError) {
      await deps.repo.updateFiscalDocumentRejected(ctx, documentId, err.message);
      log.error(
        `[worker] fiscal-issuance: rejeição de NEGÓCIO do provedor (fiscal_document ${documentId}, ` +
          `reserva ${payload.reservationId}): ${err.message}. Marcado como rejected — NÃO relançado, retry não resolveria.`,
      );
      return;
    }

    log.error(
      `[worker] fiscal-issuance: falha de REDE/infra ao chamar o gateway (fiscal_document ${documentId}, ` +
        `reserva ${payload.reservationId}): ${(err as Error).message}. Relançando para o BullMQ decidir retry/backoff.`,
    );
    throw err; // falha transitória — BullMQ decide retry/backoff/DLQ (../fiscal-queue.ts).
  }
}
