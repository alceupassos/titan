// Visão geral do portal do proprietário — rotas do owner vivem sob /portal/* (decisão desta
// faixa: route groups não criam segmento de URL, então (staff)/ e (owner)/ colidiriam em "/" se
// ambos ficassem soltos na raiz; ver relatório final da tarefa).
//
// Fase 5, Passo 4c (docs/fase-atual.md): os 2 KPI cards financeiros do placeholder da Fase 1
// ("Receita do mês", "Repasse previsto") agora são calculados de verdade sobre a amostra de
// `./sample-data.ts` (mesma técnica de apps/console/app/(staff)/fiscal/page.tsx — trocar a fonte
// por `./queries.ts` quando o Postgres estiver de pé é a única mudança necessária). "Ocupação da
// unidade" e "Próxima chegada" (que dependiam de `reservation`, fora de escopo desta faixa — só
// `payout_batches`/`administration_contracts`) foram substituídos por "Comissão do mês" e
// "Unidades sob gestão", que esta faixa consegue popular de verdade; retomar os dois primeiros
// fica para quando o Owner Portal ganhar leitura de reservas (faixa futura).
import { KpiCard } from "@titan/ui";
import { format, money } from "@titan/money";
import { PageHeader } from "@/components/PageHeader";
import { SAMPLE_OWNER_UNITS, SAMPLE_PAYOUT_BATCHES } from "./sample-data";

// Mesma âncora determinística de ./sample-data.ts — "mês corrente" é o mês desta data, nunca
// `new Date()` (preview tem que renderizar sempre igual).
const NOW_ANCHOR = new Date(Date.parse("2026-07-28T14:00:00Z"));
const PENDING_STATUSES = new Set(["draft", "pending_approval", "approved"]);

function isSameMonth(periodStartISO: string, reference: Date): boolean {
  const periodStart = new Date(`${periodStartISO}T00:00:00Z`);
  return periodStart.getUTCFullYear() === reference.getUTCFullYear() && periodStart.getUTCMonth() === reference.getUTCMonth();
}

export default function PortalVisaoGeralPage() {
  const batchesThisMonth = SAMPLE_PAYOUT_BATCHES.filter((batch) => isSameMonth(batch.periodStart, NOW_ANCHOR));
  const grossThisMonthCents = batchesThisMonth.reduce((sum, batch) => sum + batch.grossAmountCents, 0);
  const commissionThisMonthCents = batchesThisMonth.reduce((sum, batch) => sum + batch.commissionAmountCents, 0);

  // "Repasse previsto": soma do líquido de todo lote ainda não enviado (rascunho, aguardando
  // aprovação ou já aprovado mas não pago) — o que falta chegar à conta do proprietário, não só o
  // próximo lote isolado (evita escolher "o mais próximo" arbitrariamente entre unidades distintas
  // no mesmo período).
  const pendingNetCents = SAMPLE_PAYOUT_BATCHES.filter((batch) => PENDING_STATUSES.has(batch.status)).reduce(
    (sum, batch) => sum + batch.netAmountCents,
    0,
  );

  return (
    <div className="p-6">
      <PageHeader title="Visão geral" description="Desempenho e repasse das suas unidades." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Receita do mês"
          value={format(money(grossThisMonthCents, "BRL"))}
          state={grossThisMonthCents > 0 ? "ready" : "empty"}
        />
        <KpiCard
          label="Comissão do mês"
          value={format(money(commissionThisMonthCents, "BRL"))}
          state={commissionThisMonthCents > 0 ? "ready" : "empty"}
        />
        <KpiCard
          label="Repasse previsto"
          value={format(money(pendingNetCents, "BRL"))}
          state={pendingNetCents > 0 ? "ready" : "empty"}
          trend={pendingNetCents > 0 ? "down" : "flat"}
        />
        <KpiCard label="Unidades sob gestão" value={String(SAMPLE_OWNER_UNITS.length)} />
      </div>
    </div>
  );
}
