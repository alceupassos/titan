"use client";

// Tabela de saldo por unidade/item + formulário de registro de movimento (Fase 7, Passo 4c).
// Client component porque tem estado próprio (formulário de novo movimento, resultado da Server
// Action) — mesmo padrão de apps/console/app/(staff)/limpeza/CleaningBoard.tsx e
// .../servicos/WorkOrderList.tsx. Os dados recebidos via props são AMOSTRA ESTÁTICA
// (../sample-data.ts, já combinada em ./page.tsx); a ação chamada (`recordStockMovementAction`,
// ./actions.ts) é a Server Action real, contra o banco.
import { useState, useTransition } from "react";
import { StatusPill } from "@titan/ui";
import { computeReorderPoint, shouldTriggerReplenishment, type StockMovementType } from "@titan/domain";
import { recordStockMovementAction } from "./actions";

export interface StockRow {
  unitId: string;
  unitLabel: string;
  itemType: string;
  itemLabel: string;
  currentStockLevel: number;
  minQuantity: number;
  leadTimeDays: number;
  safetyStockDays: number;
  avgDailyConsumption: number;
  updatedAt: Date;
}

const MOVEMENT_TYPES: { value: StockMovementType; label: string }[] = [
  { value: "purchase", label: "Compra (entrada)" },
  { value: "consumption", label: "Consumo (saída)" },
  { value: "adjustment", label: "Ajuste de contagem — a mais (entrada)" },
  { value: "loss", label: "Perda/dano/contagem a menos (saída)" },
  { value: "return", label: "Devolução (entrada)" },
];

const UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
});

export interface StockBalanceTableProps {
  rows: readonly StockRow[];
  /** Unidade/item disponíveis para o formulário de novo movimento — inclui pares já catalogados
   * em `stock_items`, mesmo que ainda sem saldo materializado (`rows` só traz pares que já têm
   * pelo menos um movimento — ver comentário de `getStockBalancesWithItems` em ./queries.ts). */
  catalog: readonly { unitId: string; unitLabel: string; itemType: string; itemLabel: string }[];
}

interface FormState {
  unitId: string;
  itemType: string;
  type: StockMovementType;
  quantity: string;
  error: string | undefined;
  result: string | undefined;
}

const EMPTY_FORM: FormState = {
  unitId: "",
  itemType: "",
  type: "purchase",
  quantity: "",
  error: undefined,
  result: undefined,
};

export function StockBalanceTable({ rows, catalog }: StockBalanceTableProps) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isPending, startTransition] = useTransition();

  function patch(partial: Partial<FormState>): void {
    setForm((prev) => ({ ...prev, ...partial }));
  }

  function submit(): void {
    if (!form.unitId || !form.itemType) {
      patch({ error: "Selecione unidade e item.", result: undefined });
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      patch({ error: "Quantidade precisa ser um inteiro positivo — a direção vem do tipo de movimento.", result: undefined });
      return;
    }
    startTransition(async () => {
      const result = await recordStockMovementAction({
        unitId: form.unitId,
        itemType: form.itemType,
        type: form.type,
        quantity,
      });
      if (result.ok) {
        patch({ error: undefined, result: `Novo saldo reconstruído: ${result.data.newStockLevel}.`, quantity: "" });
      } else {
        patch({ error: result.error, result: undefined });
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="mb-1 text-sm font-medium text-fg">Sugestão de reposição</h2>
        {/* Rótulo explícito exigido pelo plano aprovado desta faixa — nunca deixar o usuário
            confundir a heurística determinística com um modelo de IA/forecast. */}
        <p className="mb-3 text-xs text-fg-muted">
          Heurística determinística (consumo médio × lead time + estoque de segurança) —{" "}
          <strong className="font-medium text-fg">não é um modelo de previsão de IA</strong>. Ver{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">computeReorderPoint</code> em{" "}
          <code className="rounded bg-surface-2 px-1 py-0.5">packages/domain/src/supply/stock.ts</code>.
        </p>

        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[1000px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-label text-fg-muted">
                <th className="px-4 py-3 font-medium">Unidade</th>
                <th className="px-4 py-3 font-medium">Item</th>
                <th className="px-4 py-3 font-medium">Saldo atual</th>
                <th className="px-4 py-3 font-medium">Consumo médio/dia (amostra)</th>
                <th className="px-4 py-3 font-medium">Lead time (dias)</th>
                <th className="px-4 py-3 font-medium">Estoque de segurança (dias)</th>
                <th className="px-4 py-3 font-medium">Ponto de reposição</th>
                <th className="px-4 py-3 font-medium">Atualizado em</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const reorderPoint = computeReorderPoint({
                  avgDailyConsumption: row.avgDailyConsumption,
                  leadTimeDays: row.leadTimeDays,
                  safetyStockDays: row.safetyStockDays,
                });
                const needsReplenishment = shouldTriggerReplenishment(row.currentStockLevel, reorderPoint);
                return (
                  <tr key={`${row.unitId}:${row.itemType}`} className="border-b border-border last:border-0 hover:bg-surface-2">
                    <td className="px-4 py-3 align-top">{row.unitLabel}</td>
                    <td className="px-4 py-3 align-top">{row.itemLabel}</td>
                    <td className="px-4 py-3 align-top tabular-figures">{row.currentStockLevel}</td>
                    <td className="px-4 py-3 align-top tabular-figures">{row.avgDailyConsumption}</td>
                    <td className="px-4 py-3 align-top tabular-figures">{row.leadTimeDays}</td>
                    <td className="px-4 py-3 align-top tabular-figures">{row.safetyStockDays}</td>
                    <td className="px-4 py-3 align-top tabular-figures">{reorderPoint}</td>
                    <td className="px-4 py-3 align-top tabular-figures">{UPDATED_AT_FORMATTER.format(row.updatedAt)}</td>
                    <td className="px-4 py-3 align-top">
                      {needsReplenishment ? (
                        <StatusPill tone="warning">Repor</StatusPill>
                      ) : (
                        <StatusPill tone="positive">OK</StatusPill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-medium text-fg">Registrar movimento de estoque</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="stock-unit" className="text-label text-fg-muted">
              Unidade
            </label>
            <select
              id="stock-unit"
              value={form.unitId}
              onChange={(e) => patch({ unitId: e.target.value, itemType: "" })}
              className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {Array.from(new Set(catalog.map((c) => c.unitId))).map((unitId) => (
                <option key={unitId} value={unitId}>
                  {catalog.find((c) => c.unitId === unitId)?.unitLabel ?? unitId}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="stock-item" className="text-label text-fg-muted">
              Item
            </label>
            <select
              id="stock-item"
              value={form.itemType}
              disabled={!form.unitId}
              onChange={(e) => patch({ itemType: e.target.value })}
              className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
            >
              <option value="" disabled>
                Selecione…
              </option>
              {catalog
                .filter((c) => c.unitId === form.unitId)
                .map((c) => (
                  <option key={c.itemType} value={c.itemType}>
                    {c.itemLabel}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="stock-type" className="text-label text-fg-muted">
              Tipo de movimento
            </label>
            <select
              id="stock-type"
              value={form.type}
              onChange={(e) => patch({ type: e.target.value as StockMovementType })}
              className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {MOVEMENT_TYPES.map((mt) => (
                <option key={mt.value} value={mt.value}>
                  {mt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="stock-quantity" className="text-label text-fg-muted">
              Quantidade (sempre positiva)
            </label>
            <input
              id="stock-quantity"
              type="number"
              min={1}
              step={1}
              value={form.quantity}
              onChange={(e) => patch({ quantity: e.target.value })}
              className="w-28 rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
            />
          </div>

          <button
            type="button"
            disabled={isPending}
            onClick={submit}
            className="rounded-control bg-accent px-4 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
          >
            Registrar movimento
          </button>
        </div>

        {form.error ? <p className="mt-2 text-xs text-negative">{form.error}</p> : null}
        {form.result ? <p className="mt-2 text-xs text-positive">{form.result}</p> : null}
      </div>
    </div>
  );
}
