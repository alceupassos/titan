"use client";

// Formulário de cadastro de unidade nova (Planoexplica.md, "cadastrar unidade") — cria uma linha
// REAL em `units` via ./actions.ts (Zod + CASL + withTenant dentro da própria Server Action).
// Mesmo padrão de apps/console/app/(staff)/reservas/nova/page.tsx: client component porque o
// formulário tem estado próprio e mostra o resultado da submissão inline.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, StatusPill } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { createUnitAction, type ActionResult } from "./actions";

type UnitStatus = "ready" | "blocked";

const STATUS_OPTIONS: readonly { value: UnitStatus; label: string }[] = [
  { value: "ready", label: "Pronta para receber hóspede" },
  { value: "blocked", label: "Bloqueada (em preparação/obra)" },
];

const CATEGORY_SUGGESTIONS = ["Studio", "Apartamento", "Casa", "Cobertura", "Loft", "Flat"];

interface FormState {
  name: string;
  status: UnitStatus;
  areaSqm: string;
  maxCapacity: string;
  category: string;
}

function initialFormState(): FormState {
  return { name: "", status: "ready", areaSqm: "", maxCapacity: "", category: "" };
}

export default function NovaUnidadePage() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initialFormState);
  const [result, setResult] = useState<ActionResult<{ id: string }> | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateField<K extends keyof FormState>(field: K, value: FormState[K]): void {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setResult(null);

    const areaSqm = form.areaSqm ? Number.parseInt(form.areaSqm, 10) : undefined;
    const maxCapacity = form.maxCapacity ? Number.parseInt(form.maxCapacity, 10) : undefined;

    startTransition(async () => {
      const outcome = await createUnitAction({
        name: form.name,
        status: form.status,
        ...(areaSqm && Number.isFinite(areaSqm) ? { areaSqm } : {}),
        ...(maxCapacity && Number.isFinite(maxCapacity) ? { maxCapacity } : {}),
        ...(form.category ? { category: form.category } : {}),
      });
      setResult(outcome);
      if (outcome.ok) {
        setForm(initialFormState());
      }
    });
  }

  return (
    <div className="p-6">
      <PageHeader title="Nova unidade" description="Cadastra uma unidade real — grava direto no banco." />

      <form
        onSubmit={handleSubmit}
        className="max-w-xl space-y-4 rounded-card border border-border bg-surface p-6"
      >
        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Nome</span>
          <input
            required
            value={form.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="ex.: Studio 710"
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block text-label text-fg-muted">Área (m², opcional)</span>
            <input
              type="number"
              min={1}
              value={form.areaSqm}
              onChange={(e) => updateField("areaSqm", e.target.value)}
              placeholder="ex.: 40"
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm tabular-figures text-fg placeholder:text-fg-muted"
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-label text-fg-muted">Capacidade máxima (opcional)</span>
            <input
              type="number"
              min={1}
              value={form.maxCapacity}
              onChange={(e) => updateField("maxCapacity", e.target.value)}
              placeholder="ex.: 6"
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm tabular-figures text-fg placeholder:text-fg-muted"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Categoria (opcional)</span>
          <input
            list="category-suggestions"
            value={form.category}
            onChange={(e) => updateField("category", e.target.value)}
            placeholder="ex.: Studio"
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-fg-muted"
          />
          <datalist id="category-suggestions">
            {CATEGORY_SUGGESTIONS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Status inicial</span>
          <select
            value={form.status}
            onChange={(e) => updateField("status", e.target.value as UnitStatus)}
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <Button variant="primary" disabled={isPending}>
          {isPending ? "Cadastrando…" : "Cadastrar unidade"}
        </Button>

        {result && !result.ok ? (
          <div className="rounded-control border border-border bg-surface-2 p-3 text-sm">
            <StatusPill tone="negative">Erro ao cadastrar</StatusPill>
            <p className="mt-2 text-fg-muted">{result.error}</p>
          </div>
        ) : null}

        {result?.ok ? (
          <div className="rounded-control border border-border bg-surface-2 p-3 text-sm">
            <StatusPill tone="positive">Unidade cadastrada</StatusPill>
            <p className="mt-2 text-fg-muted">
              id: <span className="tabular-figures text-fg">{result.data.id}</span>
            </p>
            <button
              type="button"
              onClick={() => router.push(`/unidades/${result.data.id}`)}
              className="mt-2 text-sm text-fg underline-offset-4 hover:underline"
            >
              Ver unidade →
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
