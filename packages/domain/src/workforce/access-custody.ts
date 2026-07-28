// Custódia de acesso (chave física, código digital, acesso de app) — portão de saída da Fase 9:
// "revogação de desligamento provada". Estrutura de cadeia hash-encadeada IDÊNTICA em espírito a
// `../evidence/chain.ts` (I10): nenhuma credencial é "removida" ou reescrita — emitir, transferir
// e revogar são sempre EVENTOS NOVOS acrescentados ao final, nunca uma edição de evento anterior.
// `packages/domain/src/workforce/` deliberadamente NÃO importa de `../evidence/` para esta parte
// — são dois bounded contexts (I10/evidência fotográfica vs. custódia de acesso) que não devem
// ficar acoplados só porque compartilham a técnica de hash chain; por isso `HashFn` é redeclarada
// aqui em vez de reexportada de `chain.ts`.
//
// Fórmula do hash (mesmo padrão de chain.ts): entryHash = hashFn(prevHash + "|" + kind + "|" +
// memberId + "|" + credentialType + "|" + credentialId + "|" + (reason ?? "")) — todo campo
// relevante da entrada entra no hash, para que alterar QUALQUER um deles (inclusive `reason`,
// lição do achado N2 da Fase 0/6: um campo fora do hash pode ser forjado sem quebrar a
// verificação) quebre `verifyAccessCredentialChain`.

export type AccessCredentialType = "physical_key" | "digital_code" | "app_access";

export type AccessCredentialEventKind = "issued" | "transferred" | "revoked";

interface AccessCredentialChainLinkBase {
  readonly entryHash: string;
  readonly prevHash: string | null;
}

export interface AccessCredentialEvent extends AccessCredentialChainLinkBase {
  readonly kind: AccessCredentialEventKind;
  readonly memberId: string;
  readonly credentialType: AccessCredentialType;
  /** Identifica a credencial física/digital específica (ex.: código da chave, id do cartão) —
   * é o que amarra "issued"/"transferred"/"revoked" à MESMA credencial ao longo do tempo. */
  readonly credentialId: string;
  /** Obrigatório para "revoked" (nunca revogação silenciosa); opcional para os demais. */
  readonly reason?: string;
}

/** Mesma assinatura de `HashFn` em `../evidence/chain.ts`, redeclarada aqui (ver nota de topo
 * sobre não acoplar os dois bounded contexts). */
export type HashFn = (input: string) => string;

function lastHash(chain: readonly AccessCredentialEvent[]): string | null {
  return chain.length > 0 ? chain[chain.length - 1]!.entryHash : null;
}

function computeEntryHash(
  prevHash: string | null,
  event: Omit<AccessCredentialEvent, "entryHash" | "prevHash">,
  hashFn: HashFn,
): string {
  return hashFn(
    `${prevHash ?? ""}|${event.kind}|${event.memberId}|${event.credentialType}|${event.credentialId}|${event.reason ?? ""}`,
  );
}

/**
 * Acrescenta um evento à cadeia de custódia de acesso. Exige `reason` não vazio quando
 * `kind === "revoked"` (mesmo princípio de `discardEvidence` em chain.ts — nunca revogação
 * silenciosa/sem motivo auditável).
 */
export function appendAccessCredentialEvent(
  chain: readonly AccessCredentialEvent[],
  event: Omit<AccessCredentialEvent, "entryHash" | "prevHash">,
  hashFn: HashFn,
): AccessCredentialEvent[] {
  if (event.kind === "revoked" && (!event.reason || event.reason.trim().length === 0)) {
    throw new RangeError(
      "Motivo de revogação é obrigatório (nunca revogar credencial de acesso silenciosamente).",
    );
  }

  const prevHash = lastHash(chain);
  const entryHash = computeEntryHash(prevHash, event, hashFn);
  const entry: AccessCredentialEvent = { ...event, entryHash, prevHash };
  return [...chain, entry];
}

/** Recalcula cada hash a partir do anterior + todo o conteúdo daquela entrada — detecta alteração
 * de 1 byte em qualquer campo de qualquer entrada anterior, mesmo padrão de `verifyChain`. */
export function verifyAccessCredentialChain(
  chain: readonly AccessCredentialEvent[],
  hashFn: HashFn,
): boolean {
  let prevHash: string | null = null;
  for (const entry of chain) {
    if (entry.prevHash !== prevHash) return false;

    const expectedEntryHash = computeEntryHash(prevHash, entry, hashFn);
    if (expectedEntryHash !== entry.entryHash) return false;

    prevHash = entry.entryHash;
  }
  return true;
}

/**
 * Credenciais atualmente ATIVAS para um membro — percorre a cadeia inteira (nunca confia num
 * campo mutável separado, mesmo princípio de `isDiscarded` em chain.ts). Algoritmo: para cada
 * `credentialId` que já apareceu na cadeia, encontra o evento MAIS RECENTE envolvendo aquele
 * `credentialId` (de QUALQUER membro — "transferred" pode mover a credencial para outro membro,
 * então o dono atual não é necessariamente quem a emitiu). Se esse evento mais recente não é
 * "revoked" E o `memberId` dele é o membro pedido, a credencial está ativa para ele. Isto é a
 * peça mais importante deste arquivo: `dismissMember` (offboarding.ts) depende desta função para
 * saber exatamente o que revogar, sem escanear manualmente.
 */
export function activeCredentialsForMember(
  chain: readonly AccessCredentialEvent[],
  memberId: string,
): AccessCredentialEvent[] {
  const latestByCredentialId = new Map<string, AccessCredentialEvent>();
  for (const event of chain) {
    // A ordem de iteração da cadeia já é cronológica (append-only) — a última atribuição no Map
    // para um credentialId é sempre o evento mais recente envolvendo aquela credencial.
    latestByCredentialId.set(event.credentialId, event);
  }

  return [...latestByCredentialId.values()].filter(
    (event) => event.kind !== "revoked" && event.memberId === memberId,
  );
}
