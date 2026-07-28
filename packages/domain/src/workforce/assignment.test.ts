import { describe, expect, it } from "vitest";
import { civilDate } from "@titan/dates";
import {
  MandatoryAssignmentCannotBeDeclinedError,
  assignShift,
  resolveAssignmentMode,
  respondToShiftAssignment,
} from "./assignment";

const DAY = civilDate("2026-08-01");

describe("resolveAssignmentMode", () => {
  it("employee -> mandatory", () => {
    expect(resolveAssignmentMode("employee")).toBe("mandatory");
  });

  it("contractor -> voluntary", () => {
    expect(resolveAssignmentMode("contractor")).toBe("voluntary");
  });

  it("unspecified -> voluntary (padrão conservador enquanto o vínculo não é confirmado)", () => {
    expect(resolveAssignmentMode("unspecified")).toBe("voluntary");
  });
});

describe("assignShift", () => {
  it("nasce accepted para employment mandatory (employee)", () => {
    const assignment = assignShift("membro-1", DAY, "employee");
    expect(assignment.status).toBe("accepted");
  });

  it("nasce proposed para employment voluntary (contractor)", () => {
    const assignment = assignShift("membro-1", DAY, "contractor");
    expect(assignment.status).toBe("proposed");
  });

  it("nasce proposed para unspecified", () => {
    const assignment = assignShift("membro-1", DAY, "unspecified");
    expect(assignment.status).toBe("proposed");
  });
});

describe("respondToShiftAssignment", () => {
  it("recusar uma atribuição mandatory lança MandatoryAssignmentCannotBeDeclinedError", () => {
    const assignment = assignShift("membro-1", DAY, "employee");
    expect(() => respondToShiftAssignment(assignment, "employee", "declined")).toThrow(
      MandatoryAssignmentCannotBeDeclinedError,
    );
  });

  it("aceitar uma atribuição voluntary funciona e não muta o objeto original", () => {
    const assignment = assignShift("membro-1", DAY, "contractor");
    const updated = respondToShiftAssignment(assignment, "contractor", "accepted");
    expect(updated.status).toBe("accepted");
    expect(assignment.status).toBe("proposed");
  });

  it("recusar uma atribuição voluntary funciona normalmente", () => {
    const assignment = assignShift("membro-1", DAY, "contractor");
    const updated = respondToShiftAssignment(assignment, "contractor", "declined");
    expect(updated.status).toBe("declined");
  });
});
