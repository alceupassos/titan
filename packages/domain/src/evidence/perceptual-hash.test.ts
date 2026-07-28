import { describe, expect, it } from "vitest";
import {
  HashLengthMismatchError,
  InvalidLuminanceArrayError,
  computeAverageHash,
  hammingDistance,
  isLikelyReused,
} from "./perceptual-hash";

function makeLuminance(overrides: Partial<Record<number, number>> = {}): number[] {
  const base = new Array(64).fill(128);
  for (const [index, value] of Object.entries(overrides)) {
    base[Number(index)] = value;
  }
  return base;
}

describe("computeAverageHash", () => {
  it("lança InvalidLuminanceArrayError quando o array não tem exatamente 64 elementos", () => {
    expect(() => computeAverageHash(new Array(63).fill(100))).toThrow(InvalidLuminanceArrayError);
    expect(() => computeAverageHash(new Array(65).fill(100))).toThrow(InvalidLuminanceArrayError);
    expect(() => computeAverageHash([])).toThrow(InvalidLuminanceArrayError);
  });

  it("produz uma string binária de 64 bits", () => {
    const hash = computeAverageHash(makeLuminance());
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[01]{64}$/);
  });

  it("mesma entrada produz o mesmo hash (determinístico)", () => {
    const luminance = makeLuminance({ 0: 255, 10: 0, 63: 200 });
    expect(computeAverageHash(luminance)).toBe(computeAverageHash(luminance));
  });
});

describe("hammingDistance", () => {
  it("hashes idênticos têm distância zero", () => {
    const hash = computeAverageHash(makeLuminance({ 0: 255 }));
    expect(hammingDistance(hash, hash)).toBe(0);
  });

  it("conta corretamente bits diferentes", () => {
    expect(hammingDistance("0000", "1111")).toBe(4);
    expect(hammingDistance("1010", "1000")).toBe(1);
  });

  it("lança HashLengthMismatchError quando os tamanhos diferem", () => {
    expect(() => hammingDistance("0000", "000")).toThrow(HashLengthMismatchError);
  });
});

describe("isLikelyReused", () => {
  it("hash idêntico a um hash recente é considerado reuso", () => {
    const hash = computeAverageHash(makeLuminance({ 5: 255, 20: 0 }));
    expect(isLikelyReused(hash, [hash], 5)).toBe(true);
  });

  it("hashes muito diferentes não são considerados reuso", () => {
    const candidate = "1".repeat(64);
    const recent = "0".repeat(64);
    expect(isLikelyReused(candidate, [recent], 5)).toBe(false);
  });

  it("respeita o thresholdBits fornecido — limiar maior detecta mais como reuso", () => {
    const candidate = "1".repeat(64);
    // distância de 10 bits em relação ao candidato
    const recent = "0".repeat(10) + "1".repeat(54);
    expect(isLikelyReused(candidate, [recent], 5)).toBe(false);
    expect(isLikelyReused(candidate, [recent], 10)).toBe(true);
  });
});
