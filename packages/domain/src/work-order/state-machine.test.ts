import { describe, expect, it } from "vitest";
import { canTransitionWorkOrder, transitionWorkOrder } from "./state-machine";

describe("Work order state machine", () => {
  it("rejeita pular de opened direto para executing", () => {
    expect(canTransitionWorkOrder("opened", "executing")).toBe(false);
  });

  it("rework sempre volta para executing (nova execução vinculada, nada apagado)", () => {
    expect(transitionWorkOrder("rework", "executing")).toBe("executing");
  });

  it("rated é terminal", () => {
    expect(canTransitionWorkOrder("rated", "opened")).toBe(false);
  });
});
