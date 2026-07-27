import { describe, expect, it } from "vitest";
import { appendEvidence, discardEvidence, verifyChain, type EvidenceEntry } from "./chain";

// hash determinístico e trivial só para teste — não é o sha256 real (isso vive na borda de I/O).
const fakeHash = (input: string) => `h(${input})`;

describe("I10 — evidência nunca é excluída, só descartada com motivo", () => {
  it("NÃO EXISTE nenhuma função de exclusão exportada do módulo — só append e discard", async () => {
    const mod = await import("./chain");
    const exportedNames = Object.keys(mod);
    const hasDeleteFn = exportedNames.some((name) => /delete/i.test(name));
    expect(hasDeleteFn).toBe(false);
  });

  it("REJEITA descarte sem motivo", () => {
    let chain: EvidenceEntry[] = [];
    chain = appendEvidence(chain, "foto-1-hash", "A1", fakeHash);
    expect(() => discardEvidence(chain, 0, "")).toThrow(/Motivo de descarte é obrigatório/);
  });

  it("descarte com motivo preserva a entrada na cadeia (não remove, só marca)", () => {
    let chain: EvidenceEntry[] = [];
    chain = appendEvidence(chain, "foto-1-hash", "A1", fakeHash);
    const discarded = discardEvidence(chain, 0, "foto duplicada, substituída pela foto-2");
    expect(discarded).toHaveLength(1);
    expect(discarded[0]?.discardedReason).toBe("foto duplicada, substituída pela foto-2");
    expect(discarded[0]?.contentHash).toBe("foto-1-hash"); // conteúdo original preservado
  });

  it("detecta alteração de 1 byte em qualquer entrada anterior da cadeia", () => {
    let chain: EvidenceEntry[] = [];
    chain = appendEvidence(chain, "foto-1-hash", "A1", fakeHash);
    chain = appendEvidence(chain, "foto-2-hash", "A2", fakeHash);
    expect(verifyChain(chain, fakeHash)).toBe(true);

    const tampered = [...chain];
    tampered[0] = { ...tampered[0]!, contentHash: "foto-1-hash-ADULTERADA" };
    expect(verifyChain(tampered, fakeHash)).toBe(false);
  });
});
