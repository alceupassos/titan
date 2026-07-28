import { describe, expect, it } from "vitest";
import { InvalidTransitionError } from "../fsm";
import { RejectionRequiresCommentError, canTransitionApproval, rejectApproval, transitionApproval } from "./approval-state-machine";
import type { ApprovalRequest } from "./approval-request";

function makeRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: "appr-1",
    tenantId: "tenant-1",
    type: "refund",
    requestedBy: "agent:financeiro v1.2",
    rationale: "Hóspede cancelou por overbooking do canal.",
    impact: { amountCents: 15000, affectedEntities: ["res-1"] },
    risk: "medium",
    requiredApprovals: 1,
    stepUpRequired: false,
    slaAtEpochMs: 1_700_000_000_000,
    status: "pending",
    ...overrides,
  };
}

describe("FSM de aprovação (seção 9.4.2)", () => {
  it("permite pending -> approved -> executed", () => {
    let status = transitionApproval("pending", "approved");
    status = transitionApproval(status, "executed");
    expect(status).toBe("executed");
  });

  it("permite pending -> rejected e pending -> expired", () => {
    expect(canTransitionApproval("pending", "rejected")).toBe(true);
    expect(canTransitionApproval("pending", "expired")).toBe(true);
  });

  it("permite approved -> failed", () => {
    expect(canTransitionApproval("approved", "failed")).toBe(true);
  });

  it("REJEITA transição inválida (ex.: pending -> executed direto, sem approved)", () => {
    expect(canTransitionApproval("pending", "executed")).toBe(false);
    expect(() => transitionApproval("pending", "executed")).toThrow(InvalidTransitionError);
  });

  it("estados terminais (rejected/expired/executed/failed) não têm saída", () => {
    expect(canTransitionApproval("rejected", "approved")).toBe(false);
    expect(canTransitionApproval("expired", "pending")).toBe(false);
    expect(canTransitionApproval("executed", "failed")).toBe(false);
    expect(canTransitionApproval("failed", "pending")).toBe(false);
  });
});

describe("rejectApproval — rejeição exige comentário", () => {
  it("REJEITA rejeição sem comentário (vazio ou só espaço)", () => {
    const request = makeRequest();
    expect(() => rejectApproval(request, "")).toThrow(RejectionRequiresCommentError);
    expect(() => rejectApproval(request, "   ")).toThrow(RejectionRequiresCommentError);
  });

  it("com comentário, transiciona para rejected sem mutar o original", () => {
    const request = makeRequest();
    const rejected = rejectApproval(request, "Documentação insuficiente para o estorno.");

    expect(rejected.status).toBe("rejected");
    expect(request.status).toBe("pending"); // original intacto — imutabilidade
    expect(rejected).not.toBe(request);
  });

  it("REJEITA rejeitar uma solicitação que já não está pending", () => {
    const executed = makeRequest({ status: "executed" });
    expect(() => rejectApproval(executed, "motivo qualquer")).toThrow(InvalidTransitionError);
  });
});
