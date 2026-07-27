import { describe, expect, it } from "vitest";
import { InvalidTransitionError } from "../fsm";
import { canTransitionPayment, transitionPayment } from "./state-machine";

describe("I2 — lastro financeiro rastreável (máquina de estados de pagamento)", () => {
  it("REJEITA pular direto de created para settled (sem autorização/captura)", () => {
    expect(canTransitionPayment("created", "settled")).toBe(false);
    expect(() => transitionPayment("created", "settled")).toThrow(InvalidTransitionError);
  });

  it("permite o caminho feliz completo: created -> authorized -> captured -> settled", () => {
    let status = transitionPayment("created", "authorized");
    status = transitionPayment(status, "captured");
    status = transitionPayment(status, "settled");
    expect(status).toBe("settled");
  });

  it("refunded é terminal — não pode voltar para settled", () => {
    expect(canTransitionPayment("refunded", "settled")).toBe(false);
  });
});
