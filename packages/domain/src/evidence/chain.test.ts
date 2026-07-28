import { describe, expect, it } from "vitest";
import {
  EvidenceNotFoundError,
  appendEvidence,
  discardEvidence,
  isDiscarded,
  verifyChain,
  type EvidenceEntry,
} from "./chain";

// hash determinístico e trivial só para teste — não é o sha256 real (isso vive na borda de I/O).
const fakeHash = (input: string) => `h(${input})`;

describe("I10 — evidência nunca é excluída, só descartada como evento novo", () => {
  it("NÃO EXISTE nenhuma função de exclusão exportada do módulo — só append e discard", async () => {
    const mod = await import("./chain");
    const exportedNames = Object.keys(mod);
    const hasDeleteFn = exportedNames.some((name) => /delete/i.test(name));
    expect(hasDeleteFn).toBe(false);
  });

  it("REJEITA descarte sem motivo", () => {
    let chain: EvidenceEntry[] = [];
    chain = appendEvidence(chain, "foto-1-hash", "A1", "envelope-1", fakeHash);
    const captureHash = chain[0]!.entryHash;
    expect(() => discardEvidence(chain, captureHash, "", fakeHash)).toThrow(/Motivo de descarte é obrigatório/);
  });

  it("REJEITA descarte de um hash que não existe na cadeia", () => {
    const chain: EvidenceEntry[] = [];
    expect(() => discardEvidence(chain, "hash-inexistente", "motivo", fakeHash)).toThrow(EvidenceNotFoundError);
  });

  it("descarte com motivo NÃO reescreve nem remove a entrada original — acrescenta um evento novo", () => {
    let chain: EvidenceEntry[] = [];
    chain = appendEvidence(chain, "foto-1-hash", "A1", "envelope-1", fakeHash);
    const originalEntry = chain[0]!;

    chain = discardEvidence(chain, originalEntry.entryHash, "foto duplicada, substituída pela foto-2", fakeHash);

    expect(chain).toHaveLength(2); // acrescentou, não substituiu
    expect(chain[0]).toEqual(originalEntry); // entrada original bit-a-bit intacta
    expect(chain[1]!.kind).toBe("discard");
    expect(isDiscarded(chain, originalEntry.entryHash)).toBe(true);
  });

  it("detecta alteração de 1 byte em qualquer entrada anterior da cadeia (envelope incluso no hash)", () => {
    let chain: EvidenceEntry[] = [];
    chain = appendEvidence(chain, "foto-1-hash", "A1", "envelope-1", fakeHash);
    chain = appendEvidence(chain, "foto-2-hash", "A2", "envelope-2", fakeHash);
    expect(verifyChain(chain, fakeHash)).toBe(true);

    const tampered = [...chain];
    tampered[0] = { ...(tampered[0] as Extract<EvidenceEntry, { kind: "capture" }>), contentHash: "foto-1-hash-ADULTERADA" };
    expect(verifyChain(tampered, fakeHash)).toBe(false);
  });

  it("achado FALHA-C: alterar o envelope de uma captura já feita quebra a verificação", () => {
    let chain: EvidenceEntry[] = [];
    chain = appendEvidence(chain, "foto-1-hash", "A1", "envelope-original", fakeHash);
    expect(verifyChain(chain, fakeHash)).toBe(true);

    const tampered = [
      { ...(chain[0] as Extract<EvidenceEntry, { kind: "capture" }>), envelope: "envelope-forjado" },
    ];
    expect(verifyChain(tampered, fakeHash)).toBe(false);
  });

  it("achado FALHA-C: forjar/reverter um descarte quebra a verificação (motivo faz parte do hash do evento)", () => {
    let chain: EvidenceEntry[] = [];
    chain = appendEvidence(chain, "foto-1-hash", "A1", "envelope-1", fakeHash);
    const captureHash = chain[0]!.entryHash;
    chain = discardEvidence(chain, captureHash, "motivo real", fakeHash);
    expect(verifyChain(chain, fakeHash)).toBe(true);

    const tampered = [
      chain[0]!,
      { ...(chain[1] as Extract<EvidenceEntry, { kind: "discard" }>), reason: "motivo forjado" },
    ];
    expect(verifyChain(tampered, fakeHash)).toBe(false);
  });
});
