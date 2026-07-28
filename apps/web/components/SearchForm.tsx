"use client";

// Busca simples da home (seção 9.1 do prompt único, escopo cortado desta fase: sem autocomplete
// geográfico — só datas, já que a Titan opera um número curado de unidades, não um catálogo
// nacional). Client component porque só faz navegação client-side para /unidades com querystring;
// a Server Action de verdade (cotação) só existe na página da unidade, onde o preço é calculado.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui/Button";

export function SearchForm() {
  const router = useRouter();
  const [checkinISO, setCheckinISO] = useState("");
  const [checkoutISO, setCheckoutISO] = useState("");

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    const params = new URLSearchParams();
    if (checkinISO) params.set("checkinISO", checkinISO);
    if (checkoutISO) params.set("checkoutISO", checkoutISO);
    const query = params.toString();
    router.push(query ? `/unidades?${query}` : "/unidades");
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-card bg-surface p-6 shadow-[var(--shadow-card-rest)] sm:flex-row sm:items-end"
    >
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-ink-muted">Check-in</span>
        <input
          type="date"
          value={checkinISO}
          onChange={(e) => setCheckinISO(e.target.value)}
          className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm tabular-figures text-ink"
        />
      </label>
      <label className="flex-1 text-sm">
        <span className="mb-1 block text-ink-muted">Check-out</span>
        <input
          type="date"
          value={checkoutISO}
          onChange={(e) => setCheckoutISO(e.target.value)}
          className="w-full rounded-control border border-border bg-surface px-3 py-2.5 text-sm tabular-figures text-ink"
        />
      </label>
      <Button type="submit">Buscar unidades</Button>
    </form>
  );
}
