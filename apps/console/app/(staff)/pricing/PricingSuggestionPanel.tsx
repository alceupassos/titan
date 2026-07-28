"use client";

// Painel interativo de /pricing (Fase 8, Passo 5) — dispara as Server Actions reais. Sem Postgres
// vivo nesta máquina (Gap conhecido 2), o clique tenta o banco real e falha com erro de conexão —
// esperado, mesmo padrão de todas as fases anteriores (ex. apps/console/app/(staff)/limpeza/
// CleaningBoard.tsx).
import { useState, useTransition } from "react";
import { Button, StatusPill } from "@titan/ui";
import { format, money } from "@titan/money";
import { runPricingSuggestionAction } from "./actions";

export function PricingSuggestionPanel({ unitId, date }: { unitId: string; date: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function handleRun() {
    startTransition(async () => {
      const outcome = await runPricingSuggestionAction({ unitId, date });
      if (outcome.ok) {
        setResult({
          ok: true,
          message: `Sugestão gravada: preço sugerido de ${format(money(outcome.data.suggestedCents, "BRL"))}, piso de ${format(money(outcome.data.floorCents, "BRL"))}.`,
        });
      } else {
        setResult({ ok: false, message: outcome.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={handleRun} disabled={isPending}>
        {isPending ? "Rodando sugestão..." : "Rodar sugestão de preço"}
      </Button>
      {result ? (
        <div className="flex items-start gap-2">
          <StatusPill tone={result.ok ? "positive" : "negative"}>{result.ok ? "OK" : "Erro"}</StatusPill>
          <p className="text-sm text-fg-muted">{result.message}</p>
        </div>
      ) : null}
    </div>
  );
}
