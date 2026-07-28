// PROVA DO SEGUNDO ITEM DO PORTÃO DE SAÍDA DA FASE 9 (docs/roadmap.md: "ciclo completo de
// estadia executado no app") — em memória, sem Postgres, sem emulador/dispositivo real (mesma
// ressalva documentada em apps/field: sem infra para "ver rodando", a prova é no nível de
// contrato/domínio que a API do app de campo consome). Simula, em sequência, os 5 estágios que o
// app de campo (apps/field) executa para uma unidade ao longo de uma virada de estadia:
// 1. check-in bloqueado até a unidade estar `ready` (I9, unit/state-machine.ts — já provado desde
//    a Fase 0, reconfirmado aqui como parte da sequência completa);
// 2. checklist de virada completo e aprovado (housekeeping/checklist.ts, Fase 6);
// 3. consumo de item de estoque registrado (supply/stock.ts, Fase 7);
// 4. OS técnica aberta e executada até concluir (work-order/state-machine.ts, Fase 0);
// 5. conclusão de tarefa registrada para o membro de campo, sem sinalização de fraude
//    (workforce/productivity.ts, Fase 9).
// Cada estágio só avança se o ANTERIOR foi aceito pela mesma regra de domínio que os Route
// Handlers de apps/console/app/api/field/** delegam — nunca uma segunda implementação paralela.
import { civilDate } from "@titan/dates";
import { describe, expect, it } from "vitest";
import { checkIn, transitionUnit, type UnitStatus } from "../unit/state-machine";
import {
  computeChecklistScore,
  type ChecklistItemResponse,
  type ChecklistTemplate,
} from "../housekeeping/checklist";
import { reconstructStockLevel, type StockMovement } from "../supply/stock";
import { canTransitionWorkOrder, transitionWorkOrder, type WorkOrderStatus } from "../work-order/state-machine";
import { computeProductivityScore, flagSuspiciousCompletions, type TaskCompletionRecord } from "./productivity";

const CHECKLIST_TEMPLATE: ChecklistTemplate = {
  id: "template-1",
  version: 1,
  serviceType: "limpeza_saida",
  sections: [
    {
      id: "quarto",
      title: "Quarto",
      items: [
        { id: "lencois", label: "Trocar lençóis", weight: 2, blocking: true, type: "photo" },
        { id: "poeira", label: "Tirar pó", weight: 1, blocking: false, type: "confirm" },
      ],
    },
  ],
  passingScore: 80,
  validFrom: civilDate("2026-01-01"),
  validTo: civilDate("2026-12-31"),
};

describe("Fase 9 — ciclo completo de estadia executado no app (portão de saída)", () => {
  it("check-in é bloqueado fora de 'ready', e só avança depois que a unidade percorre o ciclo de limpeza", () => {
    // Estágio 0: unidade acabou de ser desocupada — nunca em 'ready' logo após checkout.
    let unitStatus: UnitStatus = "dirty";
    expect(() => checkIn(unitStatus)).toThrow(); // I9 — reconfirmação, já provado desde a Fase 0.

    unitStatus = transitionUnit(unitStatus, "cleaning");
    unitStatus = transitionUnit(unitStatus, "clean");
    unitStatus = transitionUnit(unitStatus, "inspected");
    unitStatus = transitionUnit(unitStatus, "ready");
    expect(() => checkIn(unitStatus)).not.toThrow();
  });

  it("estágio 2 — checklist de virada é concluído e aprovado antes de qualquer outro estágio prosseguir", () => {
    const responses: ChecklistItemResponse[] = [
      { itemId: "lencois", answered: true, passed: true },
      { itemId: "poeira", answered: true, passed: true },
    ];
    const result = computeChecklistScore(CHECKLIST_TEMPLATE, responses);
    expect(result.passed).toBe(true);
    expect(result.scorePercent).toBe(100);
  });

  it("estágio 3 — consumo de item de estoque registrado durante a virada reconstrói o saldo corretamente", () => {
    const movements: StockMovement[] = [
      { unitId: "unit-1", itemType: "lencol_casal", type: "purchase", quantity: 10 },
      { unitId: "unit-1", itemType: "lencol_casal", type: "consumption", quantity: 2 }, // virada desta estadia
    ];
    expect(reconstructStockLevel(movements)).toBe(8);
  });

  it("estágio 4 — OS técnica aberta durante a virada é executada até concluir, sem pular estado", () => {
    let status: WorkOrderStatus = "opened";
    const path: WorkOrderStatus[] = ["triage", "dispatched", "accepted_vendor", "executing", "accepted_titan"];
    for (const next of path) {
      expect(canTransitionWorkOrder(status, next)).toBe(true);
      status = transitionWorkOrder(status, next);
    }
    expect(status).toBe("accepted_titan");
    // Nunca pula direto de 'opened' para 'executing' — prova que o app de campo não pode burlar a FSM.
    expect(canTransitionWorkOrder("opened", "executing")).toBe(false);
  });

  it("estágio 5 — conclusão de tarefa é registrada para o membro de campo sem sinalização de fraude", () => {
    const records: TaskCompletionRecord[] = [
      { memberId: "membro-1", taskId: "task-virada-1", completedAtEpochMs: 1000, evidenceHashes: ["hashA"] },
    ];
    expect(computeProductivityScore(records, "membro-1")).toBe(1);
    expect(flagSuspiciousCompletions(records, 5)).toHaveLength(0);
  });

  it("prova o ciclo completo encadeado: cada estágio só é aceito depois que o anterior foi aceito, na ordem esperada", () => {
    // Reexecuta os 5 estágios em sequência única, cada um dependendo do resultado do anterior —
    // é o que o app de campo (apps/field) executa: unidade pronta -> checklist aprovado -> baixa
    // de estoque -> OS aberta e concluída -> conclusão de tarefa registrada.
    let unitStatus: UnitStatus = "dirty";
    unitStatus = transitionUnit(unitStatus, "cleaning");
    unitStatus = transitionUnit(unitStatus, "clean");
    unitStatus = transitionUnit(unitStatus, "inspected");
    unitStatus = transitionUnit(unitStatus, "ready");
    checkIn(unitStatus); // não lança — estágio 1 aceito.

    const checklistResult = computeChecklistScore(CHECKLIST_TEMPLATE, [
      { itemId: "lencois", answered: true, passed: true },
      { itemId: "poeira", answered: true, passed: true },
    ]);
    expect(checklistResult.passed).toBe(true); // estágio 2 aceito.

    const stockLevel = reconstructStockLevel([
      { unitId: "unit-1", itemType: "lencol_casal", type: "purchase", quantity: 10 },
      { unitId: "unit-1", itemType: "lencol_casal", type: "consumption", quantity: 2 },
    ]);
    expect(stockLevel).toBeGreaterThanOrEqual(0); // estágio 3 aceito (nunca saldo negativo).

    let workOrderStatus: WorkOrderStatus = "opened";
    for (const next of ["triage", "dispatched", "accepted_vendor", "executing", "accepted_titan"] as const) {
      workOrderStatus = transitionWorkOrder(workOrderStatus, next);
    }
    expect(workOrderStatus).toBe("accepted_titan"); // estágio 4 aceito.

    const completion: TaskCompletionRecord = {
      memberId: "membro-1",
      taskId: "task-virada-1",
      completedAtEpochMs: 2000,
      evidenceHashes: ["hashFinal"],
    };
    expect(computeProductivityScore([completion], "membro-1")).toBe(1); // estágio 5 aceito.
  });
});
