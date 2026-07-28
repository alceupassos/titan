// Cofre WORM de XML/PDF fiscal (Fase 4, Passo 5 — docs/fase-atual.md, seção 9.6 do prompt único:
// "cofre com guarda de 5 anos de XML e PDF em bucket WORM"). Interface própria, deliberadamente
// SEPARADA de `packages/domain/src/evidence/chain.ts` (I10) — são dois problemas diferentes:
// evidência é uma CADEIA de eventos (captura/descarte) que precisa provar ordem e integridade
// via hash encadeado; o cofre fiscal é GUARDA DE ARQUIVO com garantia de imutabilidade (I7 —
// documento fiscal emitido não é editável) e retenção mínima de 5 anos — não há conceito de
// "cadeia" aqui, cada documento é independente. Reusar a estrutura de `chain.ts` seria forçar um
// modelo que não se aplica.
//
// Nesta fase, sem bucket WORM real provisionado (mesma limitação de infra do "Gap conhecido 1"
// da Fase 0 — VPS/storage real ainda não existe), `FiscalVault` tem duas implementações:
// `LocalFileFiscalVault` (dev — grava em disco, `chmod` read-only best-effort, NÃO é WORM de
// verdade) e a interface documentada para um adapter S3-compatível com Object Lock (produção,
// não implementado nesta sessão — sem credenciais/bucket reais para testar). Nunca fingir
// imutabilidade real sem o WORM de verdade do provedor de storage.
export type FiscalDocumentKind = "xml" | "pdf";

export interface StoreFiscalDocumentParams {
  readonly tenantId: string;
  readonly fiscalDocumentId: string;
  readonly kind: FiscalDocumentKind;
  readonly content: Buffer;
}

/** Referência opaca ao arquivo guardado — persistida em
 * `fiscal_documents.xml_storage_ref`/`pdf_storage_ref` (packages/db/migrations/0005_fiscal.sql),
 * nunca o binário em si na tabela. */
export type FiscalStorageRef = string;

export class FiscalDocumentAlreadyStoredError extends Error {
  constructor(ref: FiscalStorageRef) {
    super(
      `Já existe um arquivo guardado em "${ref}" — o cofre é WORM (write-once): nunca sobrescreve, ` +
        "só cria referências novas (mesmo espírito de I7: documento fiscal emitido não é editável).",
    );
    this.name = "FiscalDocumentAlreadyStoredError";
  }
}

export interface FiscalVault {
  /** Grava o conteúdo — lança `FiscalDocumentAlreadyStoredError` se a referência resultante já
   * existir (write-once real). Retorna a referência a persistir em `fiscal_documents`. */
  store(params: StoreFiscalDocumentParams): Promise<FiscalStorageRef>;
  /** Busca o conteúdo já guardado — nunca há rota de "editar", só `store` (novo) e `fetch`. */
  fetch(ref: FiscalStorageRef): Promise<Buffer>;
}
