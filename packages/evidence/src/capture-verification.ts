// Fase 6, Passo 4a — porta de captura de evidência (packages/evidence, borda real da Fase 6,
// diferente de packages/domain que é zero I/O). Este arquivo implementa exatamente o que a seção
// 9.8.2 do prompt único descreve: "verifica assinatura e recalcula sha256 — divergência =
// rejeição". Duas garantias distintas, nunca confundidas:
//   1) o CONTEÚDO (bytes de imagem) bate com o `contentHash` que o dispositivo declarou no
//      envelope — o servidor NUNCA confia no hash declarado, sempre recalcula e compara
//      (`recomputeContentHash`/`assertContentHashMatches`);
//   2) o ENVELOPE (metadados: taskId, unitId, geo, timestamps etc. — ver `EvidenceEnvelopeSchema`
//      de `packages/contracts/src/housekeeping.ts`) foi de fato assinado pela chave do
//      dispositivo que capturou (`verifyCaptureSignature`), verificado via HMAC injetável, mesmo
//      padrão de `verifyStepUpChallenge` em `packages/domain/src/approval/step-up.ts`
//      (hashFn/hmacFn nunca decididos aqui — injetados pelo chamador, que na borda HTTP real usa
//      `crypto.createHmac`/`crypto.createHash` de `node:crypto`).
//
// Limitação real desta fase (T1 — câmera no navegador, ADR-0012/ADR-0013): "sem chave em hardware
// no navegador, nível de garantia trava em A1, nunca A3". Concretamente, `deviceKey` aqui é
// necessariamente mais fraca que uma chave de enclave/hardware real — na borda HTTP verdadeira
// isso hoje é, na melhor das hipóteses, uma chave não-extraível gerada via WebCrypto
// (`crypto.subtle.generateKey(..., extractable: false, ...)`) ou, na ausência disso, uma chave
// simples derivada da sessão autenticada do usuário (ex. HMAC de um segredo de sessão + deviceId).
// Isso trava o nível de garantia em A1 (nunca A3) — ver `MINIMUM_ASSURANCE_BY_CONSEQUENCE` em
// `packages/domain/src/evidence/assurance-level.ts` e ADR-0013. `verifyCaptureSignature` prova
// apenas que ALGUÉM com a `deviceKey` correta assinou o envelope, nunca que essa chave está
// fisicamente isolada de exfiltração — não finge segurança que T1 não sustenta.

export class ContentHashMismatchError extends Error {
  constructor(
    public readonly expectedContentHash: string,
    public readonly recomputedContentHash: string,
  ) {
    super(
      `Hash de conteúdo recalculado (${recomputedContentHash}) diverge do declarado no envelope ` +
        `(${expectedContentHash}) — rejeição (seção 9.8.2 do prompt único: "recalcula sha256 — ` +
        `divergência = rejeição"). O servidor nunca confia no contentHash declarado pelo cliente.`,
    );
    this.name = "ContentHashMismatchError";
  }
}

/**
 * Recalcula o hash do conteúdo (bytes de imagem) recebido via upload. NÃO compara sozinha contra
 * nenhum valor declarado — só recalcula. A comparação é responsabilidade do chamador, ou usar
 * `assertContentHashMatches` abaixo, que já lança em caso de divergência.
 */
export function recomputeContentHash(bytes: Buffer, hashFn: (input: Buffer) => string): string {
  return hashFn(bytes);
}

/**
 * Conveniência que já lança `ContentHashMismatchError` em caso de divergência — a forma que a
 * borda HTTP real deve usar (seção 9.8.2: divergência é rejeição automática, não um flag).
 */
export function assertContentHashMatches(
  bytes: Buffer,
  declaredContentHash: string,
  hashFn: (input: Buffer) => string,
): void {
  const recomputed = recomputeContentHash(bytes, hashFn);
  if (recomputed !== declaredContentHash) {
    throw new ContentHashMismatchError(declaredContentHash, recomputed);
  }
}

/**
 * Verifica que `signature` é o HMAC correto de `canonicalEnvelopeJson` sob `deviceKey`. Mesmo
 * padrão de `verifyStepUpChallenge` (`packages/domain/src/approval/step-up.ts`): `hmacFn` é
 * injetado pelo chamador (na borda real, `crypto.createHmac("sha256", deviceKey)...digest(...)`)
 * — este arquivo nunca decide sozinho o algoritmo de HMAC nem importa `node:crypto` diretamente,
 * para manter a lógica de verificação testável com um `hmacFn` determinístico fake.
 *
 * `canonicalEnvelopeJson` é responsabilidade do CHAMADOR: a serialização determinística
 * (ordenação estável de chaves) do envelope (`EvidenceEnvelopeSchema` de
 * `packages/contracts/src/housekeeping.ts`) precisa ser byte-a-byte idêntica entre dispositivo e
 * servidor, ou a verificação falha por divergência de serialização, não de conteúdo — este
 * arquivo não serializa nada, só compara.
 */
export function verifyCaptureSignature(
  canonicalEnvelopeJson: string,
  signature: string,
  deviceKey: string,
  hmacFn: (key: string, message: string) => string,
): boolean {
  const expectedSignature = hmacFn(deviceKey, canonicalEnvelopeJson);
  return expectedSignature === signature;
}

/**
 * Flag de desvio de relógio entre dispositivo e servidor (seção 9.8.2 / ADR-0013: "relógio do
 * dispositivo é manipulável — o servidor sempre compara com o seu e sinaliza divergência, nunca
 * bloqueia sozinho"). É só o dado do flag — nenhuma lógica aqui decide o que fazer com ele; quem
 * chama decide (ex. elevar para revisão manual), nunca rejeitar a captura automaticamente só por
 * causa disto.
 */
export class ClockDriftFlag {
  constructor(
    public readonly deviceEpochMs: number,
    public readonly serverEpochMs: number,
    public readonly driftMs: number,
  ) {}
}

/**
 * Retorna um `ClockDriftFlag` se `|deviceEpochMs - serverEpochMs| > maxAcceptableDriftMs`, ou
 * `null` se estiver dentro da tolerância. NUNCA lança nem bloqueia sozinha — é um flag
 * informativo, não uma barreira (seção 9.8.2: desvio de relógio é revisão assistida, não rejeição
 * automática). Não existe tolerância default escondida: o chamador sempre informa
 * `maxAcceptableDriftMs` explicitamente.
 */
export function detectClockDrift(
  deviceEpochMs: number,
  serverEpochMs: number,
  maxAcceptableDriftMs: number,
): ClockDriftFlag | null {
  const driftMs = Math.abs(deviceEpochMs - serverEpochMs);
  if (driftMs <= maxAcceptableDriftMs) {
    return null;
  }
  return new ClockDriftFlag(deviceEpochMs, serverEpochMs, driftMs);
}
