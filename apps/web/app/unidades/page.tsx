import { listAvailableUnits } from "@/lib/queries";
import { UnitCard } from "@/components/UnitCard";

// Lista de unidades disponíveis (estado `ready`, I9) — sem filtro por data ainda nesta fase (ver
// nota em lib/queries.ts). `checkinISO`/`checkoutISO` da querystring (vindos da busca da home)
// são só repassados para a página de detalhe via link, para pré-preencher o formulário de
// cotação lá — não filtram esta lista.
export default async function UnidadesPage({
  searchParams,
}: {
  searchParams: Promise<{ checkinISO?: string; checkoutISO?: string }>;
}) {
  const { checkinISO, checkoutISO } = await searchParams;
  const units = await listAvailableUnits();

  const query = new URLSearchParams();
  if (checkinISO) query.set("checkinISO", checkinISO);
  if (checkoutISO) query.set("checkoutISO", checkoutISO);
  const suffix = query.toString() ? `?${query.toString()}` : "";

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <h1 className="font-display text-3xl text-ink">Unidades disponíveis</h1>
      <p className="mt-2 text-ink-muted">
        {units.length} unidade{units.length === 1 ? "" : "s"} pronta{units.length === 1 ? "" : "s"} para reserva
        direta.
      </p>

      {units.length === 0 ? (
        <p className="mt-10 text-ink-muted">Nenhuma unidade disponível no momento.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((unit) => (
            <UnitCard key={unit.id} unit={unit} hrefSuffix={suffix} />
          ))}
        </div>
      )}
    </div>
  );
}
