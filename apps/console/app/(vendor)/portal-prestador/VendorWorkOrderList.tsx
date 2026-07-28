"use client";

// Lista de "Minhas OS" com transição de estado restrita ao próprio prestador (Fase 7, Passo 4a).
// Client component porque cada linha tem estado próprio (transição pendente/resultado) — mesmo
// padrão de apps/console/app/(staff)/limpeza/servicos/WorkOrderList.tsx. Os dados recebidos via
// props são AMOSTRA ESTÁTICA (./sample-data.ts); a ação chamada
// (`vendorTransitionWorkOrderAction`, ./actions.ts) é a Server Action real, contra o banco.
//
// Diferença central em relação ao painel de staff: aqui NUNCA existe um `<select>` com todos os
// próximos estados válidos da FSM — só o botão único de ação que faz sentido o PRESTADOR disparar
// a partir do estado atual (`nextVendorAction`, ./status.ts), nunca um conjunto fixo de botões
// hardcoded por status.
import { useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import type { WorkOrderStatus } from "@titan/domain";
import type { workOrders } from "@titan/db";
import { vendorTransitionWorkOrderAction } from "./actions";
import { nextVendorAction, WORK_ORDER_STATUS_LABEL } from "./status";
import { UNIT_LABEL, VENDOR_ID } from "./sample-data";

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

// The Status-Needs-Text Rule (DESIGN.md §2): cor semântica sempre com texto.
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
  pending: boolean;
  error: string | undefined;
  appliedStatus: WorkOrderStatus | undefined;
}

export interface VendorWorkOrderListProps {
  workOrders: readonly WorkOrderRow[];
}

export function VendorWorkOrderList({ workOrders: rows }: VendorWorkOrderListProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRowState((prev) => {
      const current: RowState = prev[id] ?? { pending: false, error: undefined, appliedStatus: undefined };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function submitTransition(workOrderId: string, toStatus: WorkOrderStatus): void {
    patchRow(workOrderId, { pending: true, error: undefined });
    startTransition(async () => {
      const result = await vendorTransitionWorkOrderAction({ workOrderId, toStatus, vendorId: VENDOR_ID });
      if (result.ok) {
        patchRow(workOrderId, { pending: false, error: undefined, appliedStatus: result.data.status });
      } else {
        patchRow(workOrderId, { pending: false, error: result.error });
      }
    });
  }

  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-label text-fg-muted">
            <th className="px-4 py-3 font-medium">Unidade</th>
            <th className="px-4 py-3 font-medium">Tipo de serviço</th>
            <th className="px-4 py-3 font-medium">Descrição</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Atualizada em</th>
            <th className="px-4 py-3 font-medium">Ação</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((wo) => {
            const state = rowState[wo.id];
            const effectiveStatus = state?.appliedStatus ?? (wo.status as WorkOrderStatus);
            const action = nextVendorAction(effectiveStatus);

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
                  {!action ? (
                    <span className="text-xs text-fg-muted">Sem ação disponível neste estado.</span>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        disabled={isPending || state?.pending}
                        onClick={() => submitTransition(wo.id, action.toStatus)}
                        className="w-fit rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                      >
                        {action.label}
                      </button>
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
