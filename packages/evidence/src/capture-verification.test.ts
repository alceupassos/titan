import { describe, expect, it } from "vitest";
import {
  assertContentHashMatches,
  ClockDriftFlag,
  ContentHashMismatchError,
  detectClockDrift,
  recomputeContentHash,
  verifyCaptureSignature,
} from "./capture-verification";

// hashFn/hmacFn de teste — determinísticos e puros, mesmo espírito de
// packages/domain/src/approval/step-up.test.ts. Não são criptograficamente reais; só precisam
// reagir a qualquer mudança de 1 byte na entrada.
function fakeHash(input: Buffer | string): string {
  const str = typeof input === "string" ? input : input.toString("binary");
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return `hash:${h}`;
}

function fakeHmac(key: string, message: string): string {
  return fakeHash(`hmac:${key}:${message}`);
}

describe("recomputeContentHash / assertContentHashMatches", () => {
  it("hash recalculado bate com o esperado quando o conteúdo é o mesmo", () => {
    const bytes = Buffer.from("foto-de-teste-bytes");
    const declared = recomputeContentHash(bytes, fakeHash);
    expect(() => assertContentHashMatches(bytes, declared, fakeHash)).not.toThrow();
  });

  it("diverge (lança ContentHashMismatchError) se o conteúdo mudar 1 byte", () => {
    const original = Buffer.from("foto-de-teste-bytes");
    const declared = recomputeContentHash(original, fakeHash);

    const tampered = Buffer.from(original);
    tampered[0] = (tampered[0]! + 1) % 256; // 1 byte alterado

    expect(() => assertContentHashMatches(tampered, declared, fakeHash)).toThrow(
      ContentHashMismatchError,
    );
  });
});

describe("verifyCaptureSignature", () => {
  const canonicalEnvelope = '{"taskId":"task-1","unitId":"unit-1","capturedAtEpochMs":1000}';
  const deviceKey = "device-key-fraca-t1";

  it("assinatura válida para o envelope exato", () => {
    const signature = fakeHmac(deviceKey, canonicalEnvelope);
    expect(verifyCaptureSignature(canonicalEnvelope, signature, deviceKey, fakeHmac)).toBe(true);
  });

  it("assinatura inválida se o envelope mudar", () => {
    const signature = fakeHmac(deviceKey, canonicalEnvelope);
    const tamperedEnvelope = '{"taskId":"task-1","unitId":"unit-2","capturedAtEpochMs":1000}';
    expect(verifyCaptureSignature(tamperedEnvelope, signature, deviceKey, fakeHmac)).toBe(false);
  });

  it("assinatura inválida se a deviceKey mudar", () => {
    const signature = fakeHmac(deviceKey, canonicalEnvelope);
    expect(
      verifyCaptureSignature(canonicalEnvelope, signature, "outra-chave", fakeHmac),
    ).toBe(false);
  });
});

describe("detectClockDrift", () => {
  it("retorna null dentro da tolerância", () => {
    const flag = detectClockDrift(1_000_000, 1_000_500, 1_000);
    expect(flag).toBeNull();
  });

  it("retorna flag fora da tolerância, com os campos corretos", () => {
    const flag = detectClockDrift(1_000_000, 1_010_000, 1_000);
    expect(flag).toBeInstanceOf(ClockDriftFlag);
    expect(flag).not.toBeNull();
    expect(flag?.deviceEpochMs).toBe(1_000_000);
    expect(flag?.serverEpochMs).toBe(1_010_000);
    expect(flag?.driftMs).toBe(10_000);
  });

  it("desvio exatamente igual ao limite ainda é tolerado (comparação <=, não <)", () => {
    const flag = detectClockDrift(1_000_000, 1_001_000, 1_000);
    expect(flag).toBeNull();
  });
});
