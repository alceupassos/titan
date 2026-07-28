import { describe, expect, it } from "vitest";
import { anchorDailyRootLocally, computeDailyRoot } from "./anchor";

function fakeHash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return `hash:${h}`;
}

describe("computeDailyRoot", () => {
  it("é determinístico: mesma entrada produz o mesmo root", () => {
    const entryHashes = ["hash-1", "hash-2", "hash-3"];
    expect(computeDailyRoot(entryHashes, fakeHash)).toBe(computeDailyRoot(entryHashes, fakeHash));
  });

  it("muda se a ordem dos hashes mudar (ordem importa, não é comutativo)", () => {
    const a = computeDailyRoot(["hash-1", "hash-2"], fakeHash);
    const b = computeDailyRoot(["hash-2", "hash-1"], fakeHash);
    expect(a).not.toBe(b);
  });

  it("muda se qualquer hash da lista mudar 1 caractere", () => {
    const a = computeDailyRoot(["hash-1", "hash-2"], fakeHash);
    const b = computeDailyRoot(["hash-1", "hash-2x"], fakeHash);
    expect(a).not.toBe(b);
  });
});

describe("anchorDailyRootLocally", () => {
  it("registra rootHash e anchoredAtEpochMs recebidos, sempre com method local_placeholder", () => {
    const anchor = anchorDailyRootLocally("root-abc", 1_700_000_000_000);
    expect(anchor).toEqual({
      rootHash: "root-abc",
      anchoredAtEpochMs: 1_700_000_000_000,
      method: "local_placeholder",
    });
  });

  it("NUNCA produz method rfc3161_tsa nesta fase", () => {
    const anchor = anchorDailyRootLocally("root-xyz", 123);
    expect(anchor.method).toBe("local_placeholder");
    expect(anchor.method).not.toBe("rfc3161_tsa");
  });
});
