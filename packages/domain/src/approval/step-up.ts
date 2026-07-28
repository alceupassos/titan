// Fase 5, Passo 1 — step-up de repasse (seção 9.4.1 do prompt único, Camada 3): repasse acima de
// R$ 5.000 (500000 centavos, docs/decisoes-de-negocio.md pergunta 5) exige dupla aprovação COM
// step-up — uma segunda confirmação vinculada criptograficamente ao payload exato do lote sendo
// aprovado, não só um clique de botão (anti-padrão #15: "botão de Telegram não é controle
// interno"). A fórmula da seção 9.4.1 é `HMAC(server_key, sha256(canonical_json(batch)) || nonce
// || exp)` — este arquivo monta e verifica esse desafio, zero I/O real: nem hash nem HMAC são
// implementados aqui, ambos são injetados pelo chamador (mesmo padrão de `HashFn` em
// `packages/domain/src/evidence/chain.ts`), e a serialização canônica do payload (`canonical_json`
// da fórmula) é responsabilidade do CHAMADOR — esta função só recebe a string já serializada
// (`canonicalPayload`) e nunca decide sozinha como serializar JSON de forma determinística.
//
// Decisão de shape — `hmacFn` vs. reusar `hashFn` para o HMAC: um HMAC de verdade não é "hash com
// a chave concatenada na entrada" (essa construção ingênua é vulnerável a ataques de extensão de
// comprimento com funções tipo SHA-256 usadas cruamente). Por isso este arquivo aceita um
// `hmacFn?: (key: string, message: string) => string` OPCIONAL e distinto de `hashFn`: quando o
// chamador fornece `hmacFn` (na borda real, isso deve ser `crypto.createHmac("sha256", key)...`),
// ele é usado para a etapa de HMAC de verdade. Quando `hmacFn` está ausente (ex.: testes deste
// pacote, que só têm hashFn determinístico disponível), caímos para `hashFn(serverKey + ":" +
// message)` como aproximação PURA e determinística — documentado aqui como NÃO sendo HMAC
// criptograficamente seguro, aceitável só porque este pacote de domínio é zero I/O e a segurança
// real da borda depende de a Fase 5 (implementação real) sempre passar `hmacFn` de verdade.
export interface BuildStepUpChallengeParams {
  /** JSON canônico do payload (`canonical_json(batch)` da fórmula) — o CHAMADOR é responsável por
   * serializar de forma determinística (ordenação estável de chaves etc.); esta função só recebe
   * a string final. */
  readonly canonicalPayload: string;
  readonly serverKey: string;
  readonly nonce: string;
  readonly expiresAtEpochMs: number;
  readonly hashFn: (input: string) => string;
  /** HMAC de verdade, injetado pela borda (ex.: `crypto.createHmac`). Se ausente, usa o fallback
   * puro descrito no comentário de cabeçalho — nunca criptograficamente equivalente a um HMAC
   * real, só para manter o pacote zero I/O em teste/desenvolvimento. */
  readonly hmacFn?: (key: string, message: string) => string;
}

/** Monta a mensagem intermediária `sha256(canonical_json(batch)) || nonce || exp` da fórmula da
 * seção 9.4.1 — separador `:` explícito entre os três componentes para nunca colidir dois
 * conjuntos diferentes de (hash, nonce, exp) na mesma string concatenada (ex.: hash terminando em
 * dígito + nonce começando em dígito, sem separador, poderia colidir com um hash+nonce diferentes
 * que concatenam para o mesmo texto). */
function buildChallengeMessage(canonicalPayload: string, nonce: string, expiresAtEpochMs: number, hashFn: (input: string) => string): string {
  const payloadHash = hashFn(canonicalPayload);
  return `${payloadHash}:${nonce}:${expiresAtEpochMs}`;
}

/**
 * Monta o desafio de step-up: `HMAC(server_key, sha256(canonical_json(batch)) || nonce || exp)`.
 * Determinística e pura — o mesmo `canonicalPayload`+`serverKey`+`nonce`+`expiresAtEpochMs`
 * sempre produz o mesmo challenge.
 */
export function buildStepUpChallenge(params: BuildStepUpChallengeParams): string {
  const { canonicalPayload, serverKey, nonce, expiresAtEpochMs, hashFn, hmacFn } = params;
  const message = buildChallengeMessage(canonicalPayload, nonce, expiresAtEpochMs, hashFn);
  return hmacFn ? hmacFn(serverKey, message) : hashFn(`${serverKey}:${message}`);
}

export interface VerifyStepUpChallengeParams {
  readonly challenge: string;
  readonly canonicalPayload: string;
  readonly serverKey: string;
  readonly nonce: string;
  readonly expiresAtEpochMs: number;
  /** epoch ms — injetado pelo chamador, nunca `Date.now()` dentro do domínio (mesmo padrão de
   * `slaAtEpochMs` em `approval-request.ts`). */
  readonly nowEpochMs: number;
  readonly hashFn: (input: string) => string;
  readonly hmacFn?: (key: string, message: string) => string;
}

/**
 * Reconstrói o desafio esperado a partir dos mesmos parâmetros e compara com `challenge`
 * recebido, E verifica que `nowEpochMs < expiresAtEpochMs` — um challenge com hash batendo mas já
 * expirado NUNCA valida. Comparação de string simples (não em tempo constante) é aceitável aqui:
 * este é um pacote de domínio puro sem acesso à rede; comparação em tempo constante (contra
 * ataque de timing) é responsabilidade da borda real que expõe este verify por HTTP, fora de
 * escopo deste Passo 1.
 */
export function verifyStepUpChallenge(params: VerifyStepUpChallengeParams): boolean {
  const { challenge, canonicalPayload, serverKey, nonce, expiresAtEpochMs, nowEpochMs, hashFn, hmacFn } = params;

  if (nowEpochMs >= expiresAtEpochMs) {
    return false;
  }

  const expectedChallenge = buildStepUpChallenge({
    canonicalPayload,
    serverKey,
    nonce,
    expiresAtEpochMs,
    hashFn,
    ...(hmacFn !== undefined ? { hmacFn } : {}),
  });

  return expectedChallenge === challenge;
}
