// I10 — Evidência fotográfica nunca é excluída por nenhum papel; apenas marcada como descartada
// com motivo. Hash chain append-only (seção 9.8.2 do prompt único). Zero I/O: o hash real
// (sha256 sobre bytes de imagem) é calculado na borda; aqui recebemos os hashes já computados e
// só garantimos o encadeamento e a impossibilidade estrutural de exclusão.
//
// Fórmula do hash conforme docs/invariantes.md: entry_hash = sha256(prev_hash || contentHash ||
// envelope) — as três partes, não só prev+content (achado FALHA-C da auditoria de invariantes de
// F0, que também apontou que `discardedReason` vivia FORA do hash como campo mutável de uma
// entrada existente: um discard podia ser forjado ou revertido sem quebrar verifyChain, porque
// mutar esse campo não alterava entryHash. A correção não é só "incluir no hash" — um campo
// mutável dentro de uma entrada JÁ ENCADEADA sempre pode ser reescrito e re-hasheado por quem
// tiver acesso à função de hash. A correção real é estrutural: descartar nunca reescreve a
// entrada original — é um EVENTO NOVO, acrescentado ao final da cadeia, que referencia a entrada
// original pelo hash dela. A entrada original nunca muda; o descarte é só mais um elo append-only
// que qualquer um pode auditar, exatamente como qualquer outra captura.

export type AssuranceLevel = "A0" | "A1" | "A2" | "A3";

interface ChainLinkBase {
  readonly entryHash: string;
  readonly prevHash: string | null;
}

/** Uma captura de evidência — imutável desde a criação. Nenhum campo aqui é reescrito depois. */
export interface CaptureEntry extends ChainLinkBase {
  readonly kind: "capture";
  readonly contentHash: string;
  readonly assuranceLevel: AssuranceLevel;
  /** Metadados selados no dispositivo no momento da captura (seção 9.8.2): timestamp, deviceId,
   * geo, referenceShotId etc. — opaco aqui (zero I/O), a forma completa nasce em
   * packages/evidence na Fase 6. */
  readonly envelope: string;
}

/** O único jeito de "remover" evidência (I10): um evento novo, nunca uma reescrita da entrada
 * original. Referencia a entrada descartada pelo hash dela, não pelo índice — um índice pode
 * mudar de significado se a cadeia for reconstruída; um hash não. */
export interface DiscardEntry extends ChainLinkBase {
  readonly kind: "discard";
  readonly discardedEntryHash: string;
  readonly reason: string;
}

export type EvidenceEntry = CaptureEntry | DiscardEntry;

/** Função de hash injetada — packages/domain não importa `node:crypto` (zero I/O real, mas
 * hashing determinístico puro é aceitável; ainda assim mantemos injeção para testabilidade). */
export type HashFn = (input: string) => string;

function lastHash(chain: readonly EvidenceEntry[]): string | null {
  return chain.length > 0 ? chain[chain.length - 1]!.entryHash : null;
}

export function appendEvidence(
  chain: readonly EvidenceEntry[],
  contentHash: string,
  assuranceLevel: AssuranceLevel,
  envelope: string,
  hashFn: HashFn,
): EvidenceEntry[] {
  const prevHash = lastHash(chain);
  const entryHash = hashFn(`${prevHash ?? ""}|${contentHash}|${envelope}`);
  const entry: CaptureEntry = { kind: "capture", contentHash, entryHash, prevHash, assuranceLevel, envelope };
  return [...chain, entry];
}

export class EvidenceNotFoundError extends Error {
  constructor(hash: string) {
    super(`Nenhuma captura de evidência com hash ${hash} nesta cadeia.`);
    this.name = "EvidenceNotFoundError";
  }
}

/**
 * I10 em função pura: NÃO existe função `deleteEvidence`. A única operação de "remoção" é
 * ACRESCENTAR um evento de descarte referenciando a captura original — que nunca é reescrita,
 * removida, ou tem qualquer campo alterado.
 */
export function discardEvidence(
  chain: readonly EvidenceEntry[],
  discardedEntryHash: string,
  reason: string,
  hashFn: HashFn,
): EvidenceEntry[] {
  if (!reason || reason.trim().length === 0) {
    throw new RangeError("Motivo de descarte é obrigatório (I10 — nunca descarte silencioso).");
  }
  const target = chain.find((e) => e.kind === "capture" && e.entryHash === discardedEntryHash);
  if (!target) {
    throw new EvidenceNotFoundError(discardedEntryHash);
  }

  const prevHash = lastHash(chain);
  const entryHash = hashFn(`${prevHash ?? ""}|DISCARD|${discardedEntryHash}|${reason}`);
  const entry: DiscardEntry = { kind: "discard", entryHash, prevHash, discardedEntryHash, reason };
  return [...chain, entry];
}

/** Uma captura está descartada se existir QUALQUER evento de descarte na cadeia que a
 * referencie — a busca percorre a cadeia inteira, nunca confia num campo mutável local. */
export function isDiscarded(chain: readonly EvidenceEntry[], captureEntryHash: string): boolean {
  return chain.some((e) => e.kind === "discard" && e.discardedEntryHash === captureEntryHash);
}

/** Verifica a integridade da cadeia inteira — detecta qualquer alteração de 1 byte em qualquer
 * entrada anterior (captura OU descarte), porque o hash de cada entrada depende do hash da
 * entrada anterior E de todo o conteúdo relevante daquela entrada especificamente. */
export function verifyChain(chain: readonly EvidenceEntry[], hashFn: HashFn): boolean {
  let prevHash: string | null = null;
  for (const entry of chain) {
    if (entry.prevHash !== prevHash) return false;

    let expectedEntryHash: string;
    if (entry.kind === "capture") {
      expectedEntryHash = hashFn(`${prevHash ?? ""}|${entry.contentHash}|${entry.envelope}`);
    } else {
      expectedEntryHash = hashFn(`${prevHash ?? ""}|DISCARD|${entry.discardedEntryHash}|${entry.reason}`);
    }

    if (expectedEntryHash !== entry.entryHash) return false;
    prevHash = entry.entryHash;
  }
  return true;
}
