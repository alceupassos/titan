import { describe, expect, it } from "vitest";
import { computeAverageHashFromImageBytes, InvalidLuminanceBufferError } from "./luminance";

describe("computeAverageHashFromImageBytes", () => {
  it("produz uma string de 64 bits (0/1) a partir de uma entrada sintética simples", () => {
    // 64 bytes sintéticos: metade escura (0), metade clara (255) — não é uma imagem JPEG/PNG
    // real (decisão de escopo documentada em luminance.ts), só um buffer de luminância 8x8 já
    // pré-calculado, exatamente o formato que esta função espera.
    const bytes = Buffer.alloc(64);
    for (let i = 0; i < 64; i++) {
      bytes[i] = i < 32 ? 0 : 255;
    }

    const hash = computeAverageHashFromImageBytes(bytes);

    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[01]{64}$/);
  });

  it("mesma entrada produz o mesmo hash (determinístico)", () => {
    const bytes = Buffer.from(Array.from({ length: 64 }, (_, i) => (i * 4) % 256));
    expect(computeAverageHashFromImageBytes(bytes)).toBe(computeAverageHashFromImageBytes(bytes));
  });

  it("lança InvalidLuminanceBufferError se o buffer não tiver exatamente 64 bytes", () => {
    const tooShort = Buffer.alloc(63);
    expect(() => computeAverageHashFromImageBytes(tooShort)).toThrow(InvalidLuminanceBufferError);

    const tooLong = Buffer.alloc(65);
    expect(() => computeAverageHashFromImageBytes(tooLong)).toThrow(InvalidLuminanceBufferError);
  });
});
