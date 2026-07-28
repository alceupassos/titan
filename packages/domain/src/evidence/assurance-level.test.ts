import { describe, expect, it } from "vitest";
import { InsufficientAssuranceLevelError, enforceAssuranceLevel } from "./assurance-level";

describe("enforceAssuranceLevel", () => {
  it("aceita quando o nível é exatamente o mínimo exigido", () => {
    expect(() => enforceAssuranceLevel("A1", "release_ready")).not.toThrow();
    expect(() => enforceAssuranceLevel("A2", "withhold_deposit")).not.toThrow();
  });

  it("aceita quando o nível está acima do mínimo exigido", () => {
    expect(() => enforceAssuranceLevel("A3", "release_ready")).not.toThrow();
    expect(() => enforceAssuranceLevel("A2", "charge_linen")).not.toThrow();
    expect(() => enforceAssuranceLevel("A3", "withhold_deposit")).not.toThrow();
  });

  it("recusa com InsufficientAssuranceLevelError quando o nível está abaixo do mínimo", () => {
    expect(() => enforceAssuranceLevel("A0", "release_ready")).toThrow(InsufficientAssuranceLevelError);
    expect(() => enforceAssuranceLevel("A1", "withhold_deposit")).toThrow(InsufficientAssuranceLevelError);
    expect(() => enforceAssuranceLevel("A1", "channel_claim")).toThrow(InsufficientAssuranceLevelError);
  });

  it("a mensagem de erro identifica a consequência, o nível disponível e o mínimo exigido", () => {
    try {
      enforceAssuranceLevel("A0", "charge_vendor");
      expect.unreachable("deveria ter lançado");
    } catch (error) {
      expect(error).toBeInstanceOf(InsufficientAssuranceLevelError);
      const err = error as InsufficientAssuranceLevelError;
      expect(err.consequence).toBe("charge_vendor");
      expect(err.level).toBe("A0");
      expect(err.minimumRequired).toBe("A2");
    }
  });
});
