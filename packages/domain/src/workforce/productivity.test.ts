import { describe, expect, it } from "vitest";
import { computeProductivityScore, flagSuspiciousCompletions, type TaskCompletionRecord } from "./productivity";

function makeRecord(overrides: Partial<TaskCompletionRecord> = {}): TaskCompletionRecord {
  return {
    memberId: "membro-1",
    taskId: "tarefa-1",
    completedAtEpochMs: 0,
    evidenceHashes: [],
    ...overrides,
  };
}

describe("computeProductivityScore", () => {
  it("conta corretamente as tarefas concluídas por membro", () => {
    const records: TaskCompletionRecord[] = [
      makeRecord({ memberId: "membro-1", taskId: "t1" }),
      makeRecord({ memberId: "membro-1", taskId: "t2" }),
      makeRecord({ memberId: "membro-2", taskId: "t3" }),
    ];

    expect(computeProductivityScore(records, "membro-1")).toBe(2);
    expect(computeProductivityScore(records, "membro-2")).toBe(1);
    expect(computeProductivityScore(records, "membro-3")).toBe(0);
  });
});

describe("flagSuspiciousCompletions", () => {
  it("sinaliza quando dois registros do MESMO membro têm hash de evidência idêntico", () => {
    const records: TaskCompletionRecord[] = [
      makeRecord({ memberId: "membro-1", taskId: "t1", completedAtEpochMs: 1000, evidenceHashes: ["00001111"] }),
      makeRecord({ memberId: "membro-1", taskId: "t2", completedAtEpochMs: 2000, evidenceHashes: ["00001111"] }),
    ];

    const flags = flagSuspiciousCompletions(records, 2);

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ taskId: "t2", suspectedDuplicateOfTaskId: "t1", hammingDistance: 0 });
  });

  it("NÃO sinaliza quando os registros são de membros DIFERENTES, mesmo com hash idêntico", () => {
    const records: TaskCompletionRecord[] = [
      makeRecord({ memberId: "membro-1", taskId: "t1", completedAtEpochMs: 1000, evidenceHashes: ["00001111"] }),
      makeRecord({ memberId: "membro-2", taskId: "t2", completedAtEpochMs: 2000, evidenceHashes: ["00001111"] }),
    ];

    expect(flagSuspiciousCompletions(records, 2)).toHaveLength(0);
  });

  it("NÃO sinaliza quando os hashes estão fora do limiar", () => {
    const records: TaskCompletionRecord[] = [
      makeRecord({ memberId: "membro-1", taskId: "t1", completedAtEpochMs: 1000, evidenceHashes: ["00000000"] }),
      makeRecord({ memberId: "membro-1", taskId: "t2", completedAtEpochMs: 2000, evidenceHashes: ["11111111"] }),
    ];

    expect(flagSuspiciousCompletions(records, 2)).toHaveLength(0);
  });

  it("só compara contra registros ANTERIORES (ordenados por completedAtEpochMs), nunca futuros", () => {
    const records: TaskCompletionRecord[] = [
      makeRecord({ memberId: "membro-1", taskId: "t-mais-recente", completedAtEpochMs: 2000, evidenceHashes: ["00001111"] }),
      makeRecord({ memberId: "membro-1", taskId: "t-mais-antiga", completedAtEpochMs: 1000, evidenceHashes: ["00001111"] }),
    ];

    const flags = flagSuspiciousCompletions(records, 2);

    expect(flags).toHaveLength(1);
    expect(flags[0]!.taskId).toBe("t-mais-recente");
    expect(flags[0]!.suspectedDuplicateOfTaskId).toBe("t-mais-antiga");
  });
});
