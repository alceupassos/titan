import { describe, expect, it } from "vitest";
import { buildStepUpChallenge, verifyStepUpChallenge } from "./step-up";

// hashFn/hmacFn de teste — determinísticos e puros, mesmo espírito do `HashFn` de
// packages/domain/src/evidence/chain.ts. Não são criptograficamente reais; só precisam ser
// funções que reagem a qualquer mudança de 1 byte na entrada.
function fakeHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return `hash:${h}`;
}

function fakeHmac(key: string, message: string): string {
  return fakeHash(`hmac:${key}:${message}`);
}

const BASE_PARAMS = {
  canonicalPayload: '{"amountCents":600000,"payoutId":"payout-1"}',
  serverKey: "server-key-secreta",
  nonce: "nonce-abc",
  expiresAtEpochMs: 1_000_000,
  hashFn: fakeHash,
};

describe("buildStepUpChallenge / verifyStepUpChallenge — sem hmacFn (fallback puro documentado)", () => {
  it("challenge válido para o payload exato", () => {
    const challenge = buildStepUpChallenge(BASE_PARAMS);
    const valid = verifyStepUpChallenge({
      ...BASE_PARAMS,
      challenge,
      nowEpochMs: 999_999,
    });
    expect(valid).toBe(true);
  });

  it("challenge NÃO valida se 1 byte do payload mudar", () => {
    const challenge = buildStepUpChallenge(BASE_PARAMS);
    const tampered = {
      ...BASE_PARAMS,
      canonicalPayload: '{"amountCents":600001,"payoutId":"payout-1"}', // 1 dígito alterado
    };
    const valid = verifyStepUpChallenge({
      ...tampered,
      challenge,
      nowEpochMs: 999_999,
    });
    expect(valid).toBe(false);
  });

  it("challenge NÃO valida depois de expirado, mesmo com hash batendo", () => {
    const challenge = buildStepUpChallenge(BASE_PARAMS);
    const valid = verifyStepUpChallenge({
      ...BASE_PARAMS,
      challenge,
      nowEpochMs: BASE_PARAMS.expiresAtEpochMs, // nowEpochMs >= expiresAtEpochMs
    });
    expect(valid).toBe(false);
  });

  it("challenge muda se o nonce mudar (nunca reutilizável entre desafios)", () => {
    const challengeA = buildStepUpChallenge({ ...BASE_PARAMS, nonce: "nonce-a" });
    const challengeB = buildStepUpChallenge({ ...BASE_PARAMS, nonce: "nonce-b" });
    expect(challengeA).not.toBe(challengeB);
  });
});

describe("buildStepUpChallenge / verifyStepUpChallenge — com hmacFn real injetado", () => {
  const withHmac = { ...BASE_PARAMS, hmacFn: fakeHmac };

  it("challenge válido para o payload exato usando hmacFn", () => {
    const challenge = buildStepUpChallenge(withHmac);
    const valid = verifyStepUpChallenge({ ...withHmac, challenge, nowEpochMs: 999_999 });
    expect(valid).toBe(true);
  });

  it("challenge com hmacFn difere do challenge sem hmacFn para os mesmos parâmetros", () => {
    const challengeWithHmac = buildStepUpChallenge(withHmac);
    const challengeWithoutHmac = buildStepUpChallenge(BASE_PARAMS);
    expect(challengeWithHmac).not.toBe(challengeWithoutHmac);
  });

  it("challenge NÃO valida se a serverKey mudar", () => {
    const challenge = buildStepUpChallenge(withHmac);
    const valid = verifyStepUpChallenge({
      ...withHmac,
      serverKey: "outra-chave",
      challenge,
      nowEpochMs: 999_999,
    });
    expect(valid).toBe(false);
  });
});
