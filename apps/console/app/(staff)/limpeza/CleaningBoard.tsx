"use client";

// Quadro do dia de limpeza — client component (Fase 6, Passo 4b). Estado próprio por card
// (formulário de atribuição/reatribuição, resultado da Server Action) — mesmo padrão de
// apps/console/app/(staff)/distribuicao/DivergenceList.tsx. Os dados recebidos via props são
// AMOSTRA ESTÁTICA (../sample-data.ts, já processada em ./page.tsx); as ações chamadas
// (`assignCleaningTaskAction`, `reassignCleaningTaskAction`, ./actions.ts) são as Server Actions
// reais, contra o banco.
import { useMemo, useState, useTransition } from "react";
import { StatusPill, type StatusTone } from "@titan/ui";
import { assignCleaningTaskAction, reassignCleaningTaskAction } from "./actions";

export type RelevantUnitStatus = "dirty" | "cleaning" | "clean" | "inspected" | "rework";

export interface CleaningBoardCard {
  unitId: string;
  unitName: string;
  unitStatus: RelevantUnitStatus;
  cleaningTaskId: string | null;
  assignedTo: string | null;
  scorePercent: number | null;
  passed: boolean | null;
  /** Tempo decorrido desde o início da tarefa, já formatado — `null` se a virada ainda não
   * começou (unidade `dirty` sem `cleaning_task`). */
  elapsedLabel: string | null;
  /** Hora estimada de check-out (ou nota explicando a ausência do dado) — já formatado por
   * ./page.tsx. */
  checkoutLabel: string;
  /** Contagem regressiva até o próximo check-in (ou nota de ausência) — já formatado. */
  countdownLabel: string;
  /** Semáforo de risco: tempo restante até o próximo check-in menor que o limiar de exemplo. */
  risk: boolean;
}

const COLUMNS: { status: RelevantUnitStatus; label: string; tone: StatusTone }[] = [
  { status: "dirty", label: "Sujas", tone: "negative" },
  { status: "cleaning", label: "Em limpeza", tone: "info" },
  { status: "clean", label: "Aguardando inspeção", tone: "warning" },
  { status: "inspected", label: "Inspecionadas", tone: "positive" },
  { status: "rework", label: "Rework", tone: "warning" },
];

interface CardFormState {
  input: string;
  error: string | undefined;
  done: boolean;
}

export interface CleaningBoardProps {
  cards: readonly CleaningBoardCard[];
  /** Rótulo do limiar de risco (ex. "2h") — só para exibição no tooltip do semáforo; o cálculo
   * real já veio pronto em `card.risk` (calculado em ./page.tsx). */
  riskThresholdLabel: string;
}

export function CleaningBoard({ cards, riskThresholdLabel }: CleaningBoardProps) {
  const [formState, setFormState] = useState<Record<string, CardFormState>>({});
  const [responsibleFilter, setResponsibleFilter] = useState<string>("all");
  const [isPending, startTransition] = useTransition();

  const responsibleOptions = useMemo(() => {
    const names = new Set<string>();
    for (const card of cards) {
      if (card.assignedTo) {
        names.add(card.assignedTo);
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [cards]);

  const visibleCards =
    responsibleFilter === "all" ? cards : cards.filter((card) => card.assignedTo === responsibleFilter);

  function patchForm(key: string, patch: Partial<CardFormState>): void {
    setFormState((prev) => {
      const current: CardFormState = prev[key] ?? { input: "", error: undefined, done: false };
      return { ...prev, [key]: { ...current, ...patch } };
    });
  }

  function submitAssign(unitId: string): void {
    const key = `assign:${unitId}`;
    const assignedTo = formState[key]?.input.trim();
    if (!assignedTo) {
      patchForm(key, { error: "Informe o responsável pela virada." });
      return;
    }
    startTransition(async () => {
      const result = await assignCleaningTaskAction({ unitId, assignedTo });
      if (result.ok) {
        patchForm(key, { error: undefined, done: true });
      } else {
        patchForm(key, { error: result.error });
      }
    });
  }

  function submitReassign(cleaningTaskId: string): void {
    const key = `reassign:${cleaningTaskId}`;
    const newAssignedTo = formState[key]?.input.trim();
    if (!newAssignedTo) {
      patchForm(key, { error: "Informe o novo responsável." });
      return;
    }
    startTransition(async () => {
      const result = await reassignCleaningTaskAction({ cleaningTaskId, newAssignedTo });
      if (result.ok) {
        patchForm(key, { error: undefined, done: true });
      } else {
        patchForm(key, { error: result.error });
      }
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <label htmlFor="responsible-filter" className="text-label text-fg-muted">
          Responsável
        </label>
        <select
          id="responsible-filter"
          value={responsibleFilter}
          onChange={(e) => setResponsibleFilter(e.target.value)}
          className="rounded-control border border-border bg-surface px-3 py-1.5 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
        >
          <option value="all">Todos</option>
          {responsibleOptions.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
        <span className="text-xs text-fg-muted">
          Sem filtro por zona: packages/db/src/schema/unit.ts ainda não modela zona/área da unidade
          (bounded context inventory, fora do escopo desta faixa).
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {COLUMNS.map((column) => {
          const columnCards = visibleCards.filter((card) => card.unitStatus === column.status);
          return (
            <div key={column.status} className="rounded-card border border-border bg-surface p-3">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-fg">{column.label}</h3>
                <StatusPill tone={column.tone}>{String(columnCards.length)}</StatusPill>
              </div>

              <div className="flex flex-col gap-3">
                {columnCards.length === 0 ? (
                  <p className="text-xs text-fg-muted">Nenhuma unidade nesta coluna.</p>
                ) : (
                  columnCards.map((card) => {
                    const assignKey = `assign:${card.unitId}`;
                    const reassignKey = card.cleaningTaskId ? `reassign:${card.cleaningTaskId}` : undefined;
                    const assignState = formState[assignKey];
                    const reassignState = reassignKey ? formState[reassignKey] : undefined;

                    return (
                      <div key={card.unitId} className="rounded-control border border-border bg-bg p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-fg">{card.unitName}</span>
                          {card.risk ? (
                            <StatusPill tone="negative">Risco de atraso</StatusPill>
                          ) : null}
                        </div>

                        <dl className="grid grid-cols-1 gap-1 text-xs text-fg-muted">
                          <div>
                            <dt className="inline">Responsável: </dt>
                            <dd className="inline tabular-figures text-fg">
                              {card.assignedTo ?? "— sem responsável —"}
                            </dd>
                          </div>
                          {card.elapsedLabel ? (
                            <div>
                              <dt className="inline">Em andamento há: </dt>
                              <dd className="inline tabular-figures text-fg">{card.elapsedLabel}</dd>
                            </div>
                          ) : null}
                          <div>
                            <dt className="inline">Check-out: </dt>
                            <dd className="inline tabular-figures text-fg">{card.checkoutLabel}</dd>
                          </div>
                          <div title={`Semáforo acende com menos de ${riskThresholdLabel} de folga (valor de exemplo).`}>
                            <dt className="inline">Próximo check-in: </dt>
                            <dd className="inline tabular-figures text-fg">{card.countdownLabel}</dd>
                          </div>
                          {card.scorePercent !== null ? (
                            <div>
                              <dt className="inline">Nota do checklist: </dt>
                              <dd className="inline tabular-figures text-fg">
                                {card.scorePercent}% ({card.passed ? "aprovada" : "reprovada"})
                              </dd>
                            </div>
                          ) : null}
                        </dl>

                        {!card.cleaningTaskId ? (
                          <div className="mt-2 flex flex-col gap-1">
                            <input
                              value={assignState?.input ?? ""}
                              onChange={(e) => patchForm(assignKey, { input: e.target.value })}
                              placeholder="Nome do responsável"
                              disabled={assignState?.done}
                              className="rounded-control border border-border bg-surface p-1.5 text-xs text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                            />
                            <button
                              type="button"
                              disabled={isPending || assignState?.done}
                              onClick={() => submitAssign(card.unitId)}
                              className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
                            >
                              Iniciar virada
                            </button>
                            {assignState?.done ? (
                              <StatusPill tone="positive">Atribuída</StatusPill>
                            ) : null}
                            {assignState?.error ? (
                              <p className="text-xs text-negative">{assignState.error}</p>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-2 flex flex-col gap-1">
                            <input
                              value={reassignState?.input ?? ""}
                              onChange={(e) => reassignKey && patchForm(reassignKey, { input: e.target.value })}
                              placeholder="Reatribuir para"
                              disabled={reassignState?.done}
                              className="rounded-control border border-border bg-surface p-1.5 text-xs text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
                            />
                            <button
                              type="button"
                              disabled={isPending || reassignState?.done || !card.cleaningTaskId}
                              onClick={() => card.cleaningTaskId && submitReassign(card.cleaningTaskId)}
                              className="rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
                            >
                              Reatribuir
                            </button>
                            {reassignState?.done ? (
                              <StatusPill tone="positive">Reatribuída</StatusPill>
                            ) : null}
                            {reassignState?.error ? (
                              <p className="text-xs text-negative">{reassignState.error}</p>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
