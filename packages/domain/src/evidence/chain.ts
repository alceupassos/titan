// I10 — Evidência fotográfica nunca é excluída por nenhum papel; apenas marcada como descartada
// com motivo. Hash chain append-only (seção 9.8.2 do prompt único). Zero I/O: o hash real
// (sha256 sobre bytes de imagem) é calculado na borda; aqui recebemos os hashes já computados e
// só garantimos o encadeamento e a impossibilidade estrutural de exclusão.

export type AssuranceLevel = "A0" | "A1" | "A2" | "A3";

export interface EvidenceEntry {
  readonly contentHash: string;
  readonly entryHash: string;
  readonly prevHash: string | null;
  readonly assuranceLevel: AssuranceLevel;
  readonly discardedReason: string | null;
}

/** Função de hash injetada — packages/domain não importa `node:crypto` (zero I/O real, mas
 * hashing determinístico puro é aceitável; ainda assim mantemos injeção para testabilidade). */
export type HashFn = (input: string) => string;

export function appendEvidence(
  chain: readonly EvidenceEntry[],
  contentHash: string,
  assuranceLevel: AssuranceLevel,
  hashFn: HashFn,
): EvidenceEntry[] {
  const prevHash = chain.length > 0 ? chain[chain.length - 1]!.entryHash : null;
  const entryHash = hashFn(`${prevHash ?? ""}|${contentHash}`);
  return [...chain, { contentHash, entryHash, prevHash, assuranceLevel, discardedReason: null }];
}

/**
 * I10 em função pura: NÃO existe função `deleteEvidence`. A única operação de "remoção" é marcar
 * como descartada, preservando a entrada na cadeia (o índice/posição nunca muda de tamanho).
 */
export function discardEvidence(
  chain: readonly EvidenceEntry[],
  index: number,
  reason: string,
): EvidenceEntry[] {
  if (!reason || reason.trim().length === 0) {
    throw new RangeError("Motivo de descarte é obrigatório (I10 — nunca descarte silencioso).");
  }
  if (index < 0 || index >= chain.length) {
    throw new RangeError(`Índice fora da cadeia: ${index}`);
  }
  return chain.map((entry, i) => (i === index ? { ...entry, discardedReason: reason } : entry));
}

/** Verifica a integridade da cadeia inteira — detecta qualquer alteração de 1 byte em qualquer
 * entrada anterior, porque o hash de cada entrada depende do hash da entrada anterior. */
export function verifyChain(chain: readonly EvidenceEntry[], hashFn: HashFn): boolean {
  let prevHash: string | null = null;
  for (const entry of chain) {
    if (entry.prevHash !== prevHash) return false;
    const expectedEntryHash = hashFn(`${prevHash ?? ""}|${entry.contentHash}`);
    if (expectedEntryHash !== entry.entryHash) return false;
    prevHash = entry.entryHash;
  }
  return true;
}
