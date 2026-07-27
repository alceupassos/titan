import { stay } from "@titan/dates";
import { describe, expect, it } from "vitest";
import {
  canAcceptReservation,
  canTransitionReservation,
  transitionReservation,
} from "./state-machine";

describe("I1 — anti-overbooking (expressão pura da constraint EXCLUDE USING gist)", () => {
  it("REJEITA uma segunda reserva confirmada sobreposta na mesma unidade, mesmo de canal diferente", () => {
    const existing = [
      {
        unitId: "unit-1",
        stay: stay("2026-12-24", "2026-12-27"),
        status: "confirmed" as const,
      },
    ];
    const candidateFromOtherChannel = {
      unitId: "unit-1",
      stay: stay("2026-12-26", "2026-12-29"), // sobrepõe 26-27
    };

    expect(canAcceptReservation(candidateFromOtherChannel, existing)).toBe(false);
  });

  it("aceita reserva sem sobreposição na mesma unidade", () => {
    const existing = [
      { unitId: "unit-1", stay: stay("2026-12-24", "2026-12-27"), status: "confirmed" as const },
    ];
    const candidate = { unitId: "unit-1", stay: stay("2026-12-27", "2026-12-30") };
    expect(canAcceptReservation(candidate, existing)).toBe(true);
  });

  it("ignora reservas canceladas de outras unidades ao checar sobreposição", () => {
    const existing = [
      { unitId: "unit-1", stay: stay("2026-12-24", "2026-12-27"), status: "cancelled" as const },
    ];
    const candidate = { unitId: "unit-1", stay: stay("2026-12-25", "2026-12-26") };
    expect(canAcceptReservation(candidate, existing)).toBe(true);
  });
});

describe("Reservation state machine", () => {
  it("permite pending -> confirmed", () => {
    expect(transitionReservation("pending", "confirmed")).toBe("confirmed");
  });

  it("rejeita transição terminal -> qualquer coisa (cancelled é terminal)", () => {
    expect(canTransitionReservation("cancelled", "confirmed")).toBe(false);
  });
});
