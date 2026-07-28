// Fase 6, Passo 4a — ancoragem diária do hash-chain de evidência (seção 9.8.2/9.9 do prompt
// único: uma "raiz do dia" que resume a cadeia append-only de `packages/domain/src/evidence/chain.ts`,
// pensada para eventualmente ser registrada num relógio externo confiável — mitigação da dívida
// técnica N5 registrada em `docs/fase-atual.md`: "verifyChain valida qualquer PREFIXO da cadeia —
// truncar a cauda não quebra a verificação, sem uma âncora externa").
//
// AVISO CENTRAL, para não deixar nenhuma dúvida: isto NÃO é uma ancoragem RFC 3161 real. RFC 3161
// é o protocolo de carimbo de tempo (Time-Stamping Protocol) que uma Autoridade de Carimbo do
// Tempo (TSA — Time-Stamping Authority) externa e independente assina, provando criptografica-
// mente que um hash já existia antes de um instante. Sem uma TSA externa, "ancorar" localmente é
// só um registro no próprio banco da Titan — tão confiável quanto o relógio e a integridade do
// próprio servidor, exatamente o problema que uma TSA externa existe para resolver. Nenhuma
// conta/credencial de TSA foi configurada nesta máquina.
//
// Este arquivo é a INTERFACE que uma implementação real (RFC 3161) vai satisfazer, mais um
// placeholder local que documenta sua própria fraqueza no próprio valor que retorna
// (`method: "local_placeholder"`, nunca `"rfc3161_tsa"` nesta fase). TODO: trocar por chamada real
// a uma TSA (ex. FreeTSA, DigiCert) quando houver decisão de fornecedor.

export interface DailyRootAnchor {
  readonly rootHash: string;
  readonly anchoredAtEpochMs: number;
  readonly method: "local_placeholder" | "rfc3161_tsa";
}

/** Função de hash injetada — mesmo padrão de `HashFn` em
 * `packages/domain/src/evidence/chain.ts` (alias de tipo local, não redeclarado com forma
 * diferente, para este arquivo não depender de `packages/domain` só por causa de um tipo). */
export type HashFn = (input: string) => string;

/**
 * Calcula um único hash representando o conjunto de `entry_hash` de um dia — concatena os hashes
 * de entrada NA ORDEM RECEBIDA (o chamador é responsável por ordenar de forma determinística, ex.
 * ordem cronológica de inserção na cadeia; este arquivo nunca reordena nada), separados por `|`
 * (mesmo separador usado em `packages/domain/src/evidence/chain.ts`), e aplica `hashFn` uma única
 * vez sobre essa concatenação. Determinístico: a mesma lista, na mesma ordem, sempre produz a
 * mesma raiz.
 */
export function computeDailyRoot(entryHashes: readonly string[], hashFn: HashFn): string {
  return hashFn(entryHashes.join("|"));
}

/**
 * Implementação placeholder de ancoragem: só registra a raiz e o instante local, com
 * `method: "local_placeholder"` — NUNCA `"rfc3161_tsa"`. Nenhum caminho de código nesta fase
 * produz `method: "rfc3161_tsa"`; esse valor existe no union só para o formato já comportar a
 * implementação real futura sem quebrar o tipo em quem consome `DailyRootAnchor` — nada aqui a
 * implementa de fato.
 */
export function anchorDailyRootLocally(rootHash: string, nowEpochMs: number): DailyRootAnchor {
  return { rootHash, anchoredAtEpochMs: nowEpochMs, method: "local_placeholder" };
}
