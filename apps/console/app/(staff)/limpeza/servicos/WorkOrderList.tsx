"use client";

// Lista de OS técnica com transição de estado (Fase 6, Passo 4c). Client component porque cada
// linha tem estado próprio (próximo status escolhido, transição pendente, resultado) — mesmo
// padrão de apps/console/app/(staff)/fiscal/FiscalDocumentList.tsx. Os dados recebidos via props
// são AMOSTRA ESTÁTICA (../sample-data.ts); a ação chamada (`transitionWorkOrderAction`,
// ./actions.ts) é a Server Action real, contra o banco.
import { useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import type { WorkOrderStatus } from "@titan/domain";
import type { workOrders } from "@titan/db";
import { transitionWorkOrderAction } from "./actions";
import { nextValidStatuses, WORK_ORDER_STATUS_LABEL } from "./status";
import { UNIT_LABEL } from "./sample-data";

type WorkOrderRow = typeof workOrders.$inferSelect;

const SERVICE_TYPE_LABEL: Record<string, string> = {
  limpeza_saida: "Limpeza de saída",
  limpeza_intermediaria: "Limpeza intermediária",
  limpeza_profunda: "Limpeza profunda",
  dedetizacao: "Dedetização",
  ar_condicionado: "Ar-condicionado",
  piscina: "Piscina",
  estofado: "Estofado",
  jardinagem: "Jardinagem",
  manutencao_corretiva: "Manutenção corretiva",
  vistoria: "Vistoria",
};

// The Status-Needs-Text Rule (DESIGN.md §2): cor semântica sempre com texto. Estados
// pós-execução aceitos são "positivos"; `rework` é o único negativo de verdade (reprovação);
// os demais são neutro-informativos (fluxo normal em andamento).
const STATUS_TONE: Record<WorkOrderStatus, StatusTone> = {
  opened: "info",
  triage: "info",
  budget: "info",
  dispatched: "info",
  accepted_vendor: "info",
  executing: "warning",
  accepted_titan: "positive",
  rework: "negative",
  billed: "positive",
  paid: "positive",
  rated: "positive",
};

const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

interface RowState {
  selectedNext: WorkOrderStatus | undefined;
  error: string | undefined;
  appliedStatus: WorkOrderStatus | undefined;
}

export interface WorkOrderListProps {
  workOrders: readonly WorkOrderRow[];
}

export function WorkOrderList({ workOrders: rows }: WorkOrderListProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRowState((prev) => {
      const current: RowState = prev[id] ?? { selectedNext: undefined, error: undefined, appliedStatus: undefined };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function submitTransition(workOrderId: string, toStatus: WorkOrderStatus): void {
    startTransition(async () => {
      const result = await transitionWorkOrderAction({ workOrderId, toStatus });
      if (result.ok) {
        patchRow(workOrderId, { error: undefined, appliedStatus: result.data.status, selectedNext: undefined });
      } else {
        patchRow(workOrderId, { error: result.error });
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-label text-fg-muted">
            <th className="px-4 py-3 font-medium">Unidade</th>
            <th className="px-4 py-3 font-medium">Tipo de serviço</th>
            <th className="px-4 py-3 font-medium">Descrição</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Atualizada em</th>
            <th className="px-4 py-3 font-medium">Transicionar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((wo) => {
            const state = rowState[wo.id];
            const effectiveStatus = state?.appliedStatus ?? (wo.status as WorkOrderStatus);
            const nextOptions = nextValidStatuses(effectiveStatus);

            return (
              <tr key={wo.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                <td className="px-4 py-3 align-top">{UNIT_LABEL[wo.unitId] ?? wo.unitId}</td>
                <td className="px-4 py-3 align-top">{SERVICE_TYPE_LABEL[wo.serviceType] ?? wo.serviceType}</td>
                <td className="px-4 py-3 align-top max-w-xs text-fg-muted">{wo.description}</td>
                <td className="px-4 py-3 align-top">
                  <StatusPill tone={STATUS_TONE[effectiveStatus]}>{WORK_ORDER_STATUS_LABEL[effectiveStatus]}</StatusPill>
                </td>
                <td className="px-4 py-3 align-top tabular-figures">{UPDATED_AT_FORMATTER.format(wo.updatedAt)}</td>
                <td className="px-4 py-3 align-top">
                  {nextOptions.length === 0 ? (
                    <span className="text-xs text-fg-muted">Estado terminal — sem transição possível.</span>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2">
                        <select
                          value={state?.selectedNext ?? ""}
                          onChange={(e) => patchRow(wo.id, { selectedNext: e.target.value as WorkOrderStatus })}
                          className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
                        >
                          <option value="" disabled>
                            Próximo estado…
                          </option>
                          {nextOptions.map((status) => (
                            <option key={status} value={status}>
                              {WORK_ORDER_STATUS_LABEL[status]}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={isPending || !state?.selectedNext}
                          onClick={() => state?.selectedNext && submitTransition(wo.id, state.selectedNext)}
                          className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                        >
                          Aplicar
                        </button>
                      </div>
                      {state?.error ? <p className="max-w-64 text-xs text-negative">{state.error}</p> : null}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
