import { describe, expect, it } from "vitest";
import { CheckInBlockedError, canTransitionUnit, checkIn } from "./state-machine";

describe("I9 — check-in só a partir de 'ready', exceto override nominal com motivo", () => {
  it("REJEITA check-in quando a unidade está 'dirty'", () => {
    expect(() => checkIn("dirty")).toThrow(CheckInBlockedError);
  });

  it("REJEITA check-in quando a unidade está 'blocked', mesmo sem override", () => {
    expect(() => checkIn("blocked")).toThrow(CheckInBlockedError);
  });

  it("REJEITA override com motivo vazio (não pode ser caminho silencioso)", () => {
    expect(() => checkIn("dirty", { reason: "   " })).toThrow(CheckInBlockedError);
  });

  it("permite check-in normal quando a unidade está 'ready'", () => {
    expect(checkIn("ready")).toBe("occupied");
  });

  it("permite override nominal com motivo não vazio", () => {
    expect(checkIn("blocked", { reason: "gestor autorizou uso emergencial" })).toBe("occupied");
  });

  it("transição direta clean -> ready só é modelada explicitamente (fora da amostra de inspeção, 9.8.5)", () => {
    expect(canTransitionUnit("clean", "ready")).toBe(true);
    expect(canTransitionUnit("dirty", "ready")).toBe(false);
  });
});
