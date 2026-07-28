"use client";

// Lista + formulário do fluxo de Contas a Pagar (Fase 5, Passo 4a). Client component porque cada
// linha e o formulário têm estado próprio (transição pendente, resultado da ação, campos do
// formulário) — mesmo padrão de apps/console/app/(staff)/aprovacoes/ApprovalQueueTable.tsx. Os
// dados recebidos via props são AMOSTRA ESTÁTICA (./sample-data.ts); as ações chamadas
// (`submitAccountsPayableAction`/`payAccountsPayableAction`, ./actions.ts) são as Server Actions
// reais, contra o banco.
import { useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import { format, money } from "@titan/money";
import { payAccountsPayableAction, submitAccountsPayableAction } from "./actions";
import type {
  AccountsPayableApprovalStatus,
  AccountsPayableStatus,
  SampleAccountsPayable,
  SampleVendor,
} from "./sample-data";

const STATUS_LABEL: Record<AccountsPayableStatus, string> = {
  pending: "Pendente",
  approved: "Aprovada",
  paid: "Paga",
};

// The Status-Needs-Text Rule (DESIGN.md §2): cor + texto sempre juntos, nunca só a cor.
const STATUS_TONE: Record<AccountsPayableStatus, StatusTone> = {
  pending: "warning",
  approved: "info",
  paid: "positive",
};

const APPROVAL_STATUS_LABEL: Record<AccountsPayableApprovalStatus, string> = {
  pending: "Aguardando fila de Aprovações",
  approved: "Aprovada na fila",
  rejected: "Rejeitada na fila",
};

const APPROVAL_STATUS_TONE: Record<AccountsPayableApprovalStatus, StatusTone> = {
  pending: "warning",
  approved: "info",
  rejected: "negative",
};

const DUE_DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function formatCivilDateISO(iso: string): string {
  // Data civil (YYYY-MM-DD) — evita `new Date(iso)` (interpretaria como UTC meia-noite e poderia
  // exibir o dia anterior em fusos negativos); monta o `Date` a partir das partes explícitas.
  const [year, month, day] = iso.split("-").map(Number);
  return DUE_DATE_FORMATTER.format(new Date(year!, month! - 1, day!));
}

interface RowState {
  pending: boolean;
  error: string | undefined;
  paid: boolean;
}

export interface AccountsPayableListProps {
  items: readonly SampleAccountsPayable[];
  vendors: readonly SampleVendor[];
}

export function AccountsPayableList({ items, vendors }: AccountsPayableListProps) {
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [isPending, startTransition] = useTransition();

  // Formulário de nova despesa — campos simples de texto/número; `amountCentsInput` é digitado
  // diretamente em CENTAVOS (nunca reais com vírgula) para não introduzir nenhum parse de float na
  // borda — mesma disciplina de docs/anti-padroes.md #9 aplicada até no client component.
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [unitId, setUnitId] = useState("");
  const [description, setDescription] = useState("");
  const [amountCentsInput, setAmountCentsInput] = useState("");
  const [dueDateISO, setDueDateISO] = useState("");
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [formSuccess, setFormSuccess] = useState<string | undefined>(undefined);

  function patchRow(id: string, patch: Partial<RowState>): void {
    setRowState((prev) => {
      const current: RowState = prev[id] ?? { pending: false, error: undefined, paid: false };
      return { ...prev, [id]: { ...current, ...patch } };
    });
  }

  function handlePay(item: SampleAccountsPayable): void {
    patchRow(item.id, { error: undefined });
    startTransition(async () => {
      const result = await payAccountsPayableAction({ accountsPayableId: item.id });
      if (result.ok) {
        patchRow(item.id, { paid: true, error: undefined });
      } else {
        patchRow(item.id, { error: result.error });
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFormError(undefined);
    setFormSuccess(undefined);

    const amountCents = Number.parseInt(amountCentsInput, 10);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      setFormError("Valor em centavos deve ser um inteiro positivo.");
      return;
    }

    startTransition(async () => {
      const result = await submitAccountsPayableAction({
        vendorId,
        unitId: unitId.trim().length > 0 ? unitId.trim() : undefined,
        description,
        amountCents,
        currency: "BRL",
        dueDateISO,
      });
      if (result.ok) {
        setFormSuccess(
          `Despesa submetida — solicitação de aprovação ${result.data.approvalRequestId} aberta na fila /aprovacoes.`,
        );
        setDescription("");
        setAmountCentsInput("");
        setDueDateISO("");
        setUnitId("");
      } else {
        setFormError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-5"
      >
        <h2 className="text-label text-fg-muted">Nova despesa (contas a pagar)</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Fornecedor
            <select
              value={vendorId}
              onChange={(e) => setVendorId(e.target.value)}
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
            >
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name} ({vendor.category})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Unidade (opcional — id)
            <input
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              placeholder="uuid da unidade, se aplicável"
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Vencimento
            <input
              type="date"
              value={dueDateISO}
              onChange={(e) => setDueDateISO(e.target.value)}
              required
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted sm:col-span-2">
            Descrição
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              placeholder="Ex.: lavagem de enxoval — virada de julho"
              className="rounded-control border border-border bg-bg p-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-fg-muted">
            Valor (centavos)
            <input
              inputMode="numeric"
              value={amountCentsInput}
              onChange={(e) => setAmountCentsInput(e.target.value)}
              required
              placeholder="Ex.: 42000 = R$ 420,00"
              className="rounded-control border border-border bg-bg p-2 text-sm tabular-figures text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="self-start rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
          >
            Submeter despesa
          </button>
          {formError ? <p className="text-xs text-negative">{formError}</p> : null}
          {formSuccess ? <p className="text-xs text-positive">{formSuccess}</p> : null}
        </div>
      </form>

      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead>
            <tr className="border-b border-border text-label text-fg-muted">
              <th className="px-4 py-3 font-medium">Fornecedor</th>
              <th className="px-4 py-3 font-medium">Unidade</th>
              <th className="px-4 py-3 font-medium">Descrição</th>
              <th className="px-4 py-3 font-medium">Valor</th>
              <th className="px-4 py-3 font-medium">Vencimento</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Aprovação</th>
              <th className="px-4 py-3 font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const state = rowState[item.id];
              const isPaid = item.status === "paid" || state?.paid === true;
              const canPay = !isPaid && item.approvalStatus === "approved";

              return (
                <tr key={item.id} className="border-b border-border last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 align-top">{item.vendorName}</td>
                  <td className="px-4 py-3 align-top text-fg-muted">{item.unitLabel ?? "—"}</td>
                  <td className="px-4 py-3 align-top max-w-sm text-fg-muted">{item.description}</td>
                  <td className="px-4 py-3 align-top tabular-figures">
                    {format(money(item.amountCents, item.currency))}
                  </td>
                  <td className="px-4 py-3 align-top tabular-figures">{formatCivilDateISO(item.dueDateISO)}</td>
                  <td className="px-4 py-3 align-top">
                    <StatusPill tone={STATUS_TONE[isPaid ? "paid" : item.status]}>
                      {STATUS_LABEL[isPaid ? "paid" : item.status]}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusPill tone={APPROVAL_STATUS_TONE[item.approvalStatus]}>
                      {APPROVAL_STATUS_LABEL[item.approvalStatus]}
                    </StatusPill>
                  </td>
                  <td className="px-4 py-3 align-top">
                    {isPaid ? (
                      <span className="text-xs text-fg-muted">—</span>
                    ) : (
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          disabled={isPending || !canPay}
                          onClick={() => handlePay(item)}
                          className="self-start rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                        >
                          Marcar como paga
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
    </div>
  );
}
