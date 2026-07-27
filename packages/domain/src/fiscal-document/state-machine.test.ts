import { describe, expect, it } from "vitest";
import {
  FiscalDocumentImmutableError,
  assertNotEditingIssuedDocument,
  canTransitionFiscalDocument,
} from "./state-machine";

describe("I7 — documento fiscal emitido é imutável", () => {
  it("REJEITA edição de documento já emitido", () => {
    expect(() => assertNotEditingIssuedDocument("issued", "edit")).toThrow(
      FiscalDocumentImmutableError,
    );
  });

  it("permite cancelamento e substituição de documento emitido", () => {
    expect(() => assertNotEditingIssuedDocument("issued", "cancel")).not.toThrow();
    expect(() => assertNotEditingIssuedDocument("issued", "substitute")).not.toThrow();
  });

  it("draft ainda pode ser editado livremente (não passou a ser 'issued')", () => {
    expect(() => assertNotEditingIssuedDocument("draft", "edit")).not.toThrow();
  });

  it("estados terminais (cancelled/substituted) não têm saída", () => {
    expect(canTransitionFiscalDocument("cancelled", "issued")).toBe(false);
    expect(canTransitionFiscalDocument("substituted", "issued")).toBe(false);
  });
});
