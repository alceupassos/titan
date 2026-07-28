import Link from "next/link";
import { priceStay } from "@titan/domain";
import { stay } from "@titan/dates";
import { format as formatMoney } from "@titan/money";
import { getUnitDetail } from "@/lib/queries";
import { CheckoutForm } from "./CheckoutForm";

interface CheckoutSearchParams {
  unitId?: string;
  ratePlanId?: string;
  checkinISO?: string;
  checkoutISO?: string;
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<CheckoutSearchParams>;
}) {
  const { unitId, ratePlanId, checkinISO, checkoutISO } = await searchParams;

  if (!unitId || !ratePlanId || !checkinISO || !checkoutISO) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-2xl text-ink">Cotação não encontrada</h1>
        <p className="mt-3 text-ink-muted">
          Faltam dados de unidade/datas para iniciar o checkout. Volte e cote uma unidade.
        </p>
        <Link href="/unidades" className="mt-6 inline-block text-sm font-medium text-accent-fg underline">
          Ver unidades disponíveis
        </Link>
      </div>
    );
  }

  const unit = await getUnitDetail(unitId);
  const ratePlan = unit?.ratePlans.find((rp) => rp.id === ratePlanId);

  if (!unit || !ratePlan) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-2xl text-ink">Unidade ou plano de tarifa não encontrado</h1>
        <Link href="/unidades" className="mt-6 inline-block text-sm font-medium text-accent-fg underline">
          Ver unidades disponíveis
        </Link>
      </div>
    );
  }

  let priceLabel: string;
  try {
    // Preço recalculado aqui de novo, na renderização do resumo — nunca confiamos num valor de
    // cotação vindo da querystring. `createCheckoutAction` recalcula uma TERCEIRA vez no momento
    // do submit, que é o valor que de fato vira `reservations.price_cents`.
    const priceAmount = priceStay(ratePlan, stay(checkinISO, checkoutISO));
    priceLabel = formatMoney(priceAmount);
  } catch (err) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="font-display text-2xl text-ink">Não foi possível calcular o preço</h1>
        <p className="mt-3 text-ink-muted">{err instanceof Error ? err.message : "Estadia inválida."}</p>
        <Link href={`/unidades/${unitId}`} className="mt-6 inline-block text-sm font-medium text-accent-fg underline">
          Voltar e recotar
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-3xl text-ink">Finalizar reserva</h1>
      <div className="mt-4 rounded-card bg-surface-2 p-5 text-sm">
        <p className="font-medium text-ink">{unit.name}</p>
        <p className="mt-1 text-ink-muted">
          {checkinISO} → {checkoutISO}
        </p>
        <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
          <span className="text-ink-muted">Total</span>
          <span className="tabular-figures text-lg font-semibold text-ink">{priceLabel}</span>
        </div>
      </div>

      <div className="mt-8">
        <CheckoutForm unitId={unitId} ratePlanId={ratePlanId} checkinISO={checkinISO} checkoutISO={checkoutISO} />
      </div>
    </div>
  );
}
