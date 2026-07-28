import { notFound } from "next/navigation";
import { getUnitDetail } from "@/lib/queries";
import { QuoteForm } from "./QuoteForm";

export default async function UnidadeDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkinISO?: string; checkoutISO?: string }>;
}) {
  const { id } = await params;
  const { checkinISO, checkoutISO } = await searchParams;
  const unit = await getUnitDetail(id);

  if (!unit) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-8 flex aspect-[16/9] items-center justify-center rounded-card bg-surface-2 text-ink-muted">
        <span className="text-sm">Galeria de fotos em breve</span>
      </div>

      <h1 className="font-display text-3xl text-ink">{unit.name}</h1>
      <p className="mt-2 text-ink-muted">
        Estadia com o cuidado direto da Titan Empreendimentos — sem intermediação de canal.
      </p>

      <div className="mt-8">
        <QuoteForm
          unitId={unit.id}
          ratePlans={unit.ratePlans}
          initialCheckinISO={checkinISO}
          initialCheckoutISO={checkoutISO}
        />
      </div>
    </div>
  );
}
