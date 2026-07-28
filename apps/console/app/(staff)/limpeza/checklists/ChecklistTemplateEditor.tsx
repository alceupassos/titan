"use client";

// Formulário de criação de NOVA VERSÃO de checklist (Fase 6, Passo 4c). Client component porque
// o formulário tem estado próprio (seções/itens montados dinamicamente antes de submeter) — mesmo
// padrão de apps/console/app/(staff)/fiscal/FiscalDocumentList.tsx e
// apps/console/app/(staff)/aprovacoes/ApprovalQueueTable.tsx. Nunca edita uma versão existente:
// este componente só CRIA (a Server Action, ./actions.ts, sempre faz INSERT, nunca UPDATE).
import { useState, useTransition } from "react";
import type { ChecklistSectionInput } from "./actions";
import { createChecklistTemplateVersionAction } from "./actions";
import { ALL_SERVICE_TYPES, SERVICE_TYPE_LABEL } from "./sample-data";

type ItemType = "photo" | "confirm" | "numeric" | "select" | "text" | "scan" | "timer" | "signature";

const ITEM_TYPE_OPTIONS: readonly ItemType[] = [
  "photo",
  "confirm",
  "numeric",
  "select",
  "text",
  "scan",
  "timer",
  "signature",
];

let localIdCounter = 0;
/** Id local só para controlar as linhas do formulário (React key) — o id de domínio real do item
 * (`ChecklistItem.id`) é o texto digitado no campo "id", não este. */
function nextLocalId(): string {
  localIdCounter += 1;
  return `local-${localIdCounter}`;
}

interface DraftItem {
  localId: string;
  id: string;
  label: string;
  weight: number;
  blocking: boolean;
  type: ItemType;
}

interface DraftSection {
  localId: string;
  id: string;
  title: string;
  items: DraftItem[];
}

function newItem(): DraftItem {
  return { localId: nextLocalId(), id: "", label: "", weight: 1, blocking: false, type: "confirm" };
}

function newSection(): DraftSection {
  return { localId: nextLocalId(), id: "", title: "", items: [newItem()] };
}

function toSectionInput(section: DraftSection): ChecklistSectionInput {
  return {
    id: section.id,
    title: section.title,
    items: section.items.map((item) => ({
      id: item.id,
      label: item.label,
      weight: item.weight,
      blocking: item.blocking,
      type: item.type,
    })),
  };
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "error"; message: string }
  | { kind: "success"; version: number };

export function ChecklistTemplateEditor() {
  const [serviceType, setServiceType] = useState<(typeof ALL_SERVICE_TYPES)[number]>(ALL_SERVICE_TYPES[0]);
  const [passingScore, setPassingScore] = useState(80);
  const [validFrom, setValidFrom] = useState("2026-08-01");
  const [validTo, setValidTo] = useState("2999-12-31");
  const [sections, setSections] = useState<DraftSection[]>([newSection()]);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  function addSection(): void {
    setSections((prev) => [...prev, newSection()]);
  }

  function removeSection(localId: string): void {
    setSections((prev) => prev.filter((s) => s.localId !== localId));
  }

  function updateSection(localId: string, patch: Partial<DraftSection>): void {
    setSections((prev) => prev.map((s) => (s.localId === localId ? { ...s, ...patch } : s)));
  }

  function addItem(sectionLocalId: string): void {
    setSections((prev) =>
      prev.map((s) => (s.localId === sectionLocalId ? { ...s, items: [...s.items, newItem()] } : s)),
    );
  }

  function removeItem(sectionLocalId: string, itemLocalId: string): void {
    setSections((prev) =>
      prev.map((s) =>
        s.localId === sectionLocalId ? { ...s, items: s.items.filter((i) => i.localId !== itemLocalId) } : s,
      ),
    );
  }

  function updateItem(sectionLocalId: string, itemLocalId: string, patch: Partial<DraftItem>): void {
    setSections((prev) =>
      prev.map((s) =>
        s.localId === sectionLocalId
          ? { ...s, items: s.items.map((i) => (i.localId === itemLocalId ? { ...i, ...patch } : i)) }
          : s,
      ),
    );
  }

  function submit(): void {
    setSubmitState({ kind: "idle" });
    startTransition(async () => {
      const result = await createChecklistTemplateVersionAction({
        serviceType,
        passingScore,
        validFrom,
        validTo,
        sections: sections.map(toSectionInput),
      });
      if (result.ok) {
        setSubmitState({ kind: "success", version: result.data.version });
        setSections([newSection()]);
      } else {
        setSubmitState({ kind: "error", message: result.error });
      }
    });
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          Tipo de serviço
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as (typeof ALL_SERVICE_TYPES)[number])}
            className="rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            {ALL_SERVICE_TYPES.map((value) => (
              <option key={value} value={value}>
                {SERVICE_TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          Pontuação mínima (0-100)
          <input
            type="number"
            min={0}
            max={100}
            value={passingScore}
            onChange={(e) => setPassingScore(Number(e.target.value))}
            className="tabular-figures rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          Vigente a partir de
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="tabular-figures rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-fg-muted">
          Vigente até
          <input
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            className="tabular-figures rounded-control border border-border bg-bg p-2 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent"
          />
        </label>
      </div>

      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <div key={section.localId} className="rounded-control border border-border bg-bg p-4">
            <div className="mb-3 flex items-end gap-3">
              <label className="flex flex-1 flex-col gap-1 text-xs text-fg-muted">
                Id da seção
                <input
                  value={section.id}
                  onChange={(e) => updateSection(section.localId, { id: e.target.value })}
                  placeholder="ex.: sec-quarto"
                  className="rounded-control border border-border bg-surface p-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
                />
              </label>
              <label className="flex flex-1 flex-col gap-1 text-xs text-fg-muted">
                Título da seção
                <input
                  value={section.title}
                  onChange={(e) => updateSection(section.localId, { title: e.target.value })}
                  placeholder="ex.: Quarto"
                  className="rounded-control border border-border bg-surface p-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
                />
              </label>
              <button
                type="button"
                onClick={() => removeSection(section.localId)}
                disabled={sections.length <= 1}
                className="rounded-control border border-border bg-transparent px-3 py-2 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50"
              >
                Remover seção
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {section.items.map((item) => (
                <div
                  key={item.localId}
                  className="grid grid-cols-1 items-end gap-2 rounded-control border border-border bg-surface p-3 sm:grid-cols-6"
                >
                  <label className="flex flex-col gap-1 text-xs text-fg-muted sm:col-span-1">
                    Id
                    <input
                      value={item.id}
                      onChange={(e) => updateItem(section.localId, item.localId, { id: e.target.value })}
                      className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-muted sm:col-span-2">
                    Rótulo
                    <input
                      value={item.label}
                      onChange={(e) => updateItem(section.localId, item.localId, { label: e.target.value })}
                      className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-muted">
                    Tipo
                    <select
                      value={item.type}
                      onChange={(e) =>
                        updateItem(section.localId, item.localId, { type: e.target.value as ItemType })
                      }
                      className="rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      {ITEM_TYPE_OPTIONS.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-fg-muted">
                    Peso
                    <input
                      type="number"
                      min={0}
                      value={item.weight}
                      onChange={(e) =>
                        updateItem(section.localId, item.localId, { weight: Number(e.target.value) })
                      }
                      className="tabular-figures rounded-control border border-border bg-bg p-1.5 text-xs text-fg focus-visible:outline-2 focus-visible:outline-accent"
                    />
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <input
                      type="checkbox"
                      checked={item.blocking}
                      onChange={(e) => updateItem(section.localId, item.localId, { blocking: e.target.checked })}
                    />
                    Bloqueante
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(section.localId, item.localId)}
                    disabled={section.items.length <= 1}
                    className="rounded-control border border-border bg-transparent px-2 py-1 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg disabled:opacity-50 sm:col-span-6"
                  >
                    Remover item
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => addItem(section.localId)}
                className="self-start rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg"
              >
                + Adicionar item
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addSection}
          className="self-start rounded-control border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors duration-100 hover:bg-surface-2 hover:text-fg"
        >
          + Adicionar seção
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="rounded-control bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-colors duration-100 hover:bg-accent/90 disabled:opacity-50"
          title="Cria uma NOVA versão — nunca edita uma versão já existente."
        >
          Criar nova versão
        </button>
        {submitState.kind === "success" ? (
          <p className="text-xs text-positive">Versão {submitState.version} criada.</p>
        ) : null}
        {submitState.kind === "error" ? <p className="text-xs text-negative">{submitState.message}</p> : null}
      </div>
    </div>
  );
}
