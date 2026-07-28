// Cockpit financeiro (Fase 5, Passo 4a — docs/fase-atual.md; seção 9.5 do prompt único). Esta
// passada cobre só a seção de Contas a Pagar (AP) — repasses (apps/console/app/(staff)/repasses),
// portal do proprietário (apps/console/app/(owner)/portal) e o DRE (nova sub-rota
// apps/console/app/(staff)/financeiro/dre) são faixas paralelas, fora de escopo aqui.
//
// LAYOUT: seções verticais simples (`<section>` irmãs), não abas — a seção de AP abaixo não
// ocupa a página inteira de propósito, para a faixa do DRE poder adicionar sua própria `<section>`
// logo abaixo sem precisar reestruturar este arquivo. Link simples para `/financeiro/dre` (sem
// editar `apps/console/lib/nav.ts`, que é escrito por outra faixa nesta mesma janela de trabalho —
// dois agentes editando o mesmo arquivo ao mesmo tempo é exatamente o anti-padrão #21 de
// docs/anti-padroes.md; se uma sub-navegação de verdade for necessária, fica para quando as faixas
// paralelas converegem).
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), então esta página Server
// Component não consulta `packages/db` para LER ainda — mesmo padrão de .../aprovacoes/page.tsx e
// .../fiscal/page.tsx. As contagens dos KPI cards abaixo são, ainda assim, CALCULADAS de verdade
// sobre a amostra (nunca "0" hardcoded) com a MESMA lógica que uma query real usaria — trocar a
// fonte por `withTenant(...).select()...` quando o banco estiver de pé é a única mudança
// necessária. O CAMINHO DE ESCRITA (`submitAccountsPayableAction`/`payAccountsPayableAction`,
// ./actions.ts, chamados por ./AccountsPayableList.tsx) já é real, contra o banco via `withTenant`.
import { KpiCard } from "@titan/ui";
import { format, money } from "@titan/money";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { AccountsPayableList } from "./AccountsPayableList";
import { SAMPLE_ACCOUNTS_PAYABLE, SAMPLE_VENDORS } from "./sample-data";

// Mesma âncora determinística usada em .../fiscal/page.tsx — "mês corrente" para o KPI de "pagas
// no mês" é o mês desta data, não `new Date()` (preview tem que renderizar sempre igual).
const NOW_ANCHOR = new Date(Date.parse("2026-07-28T14:00:00Z"));

function isSameMonth(iso: string, reference: Date): boolean {
  const [year, month] = iso.split("-").map(Number);
  return year === reference.getUTCFullYear() && month! - 1 === reference.getUTCMonth();
}

export default function FinanceiroPage() {
  const pending = SAMPLE_ACCOUNTS_PAYABLE.filter((item) => item.status === "pending");
  const totalPendingCents = pending.reduce((sum, item) => sum + item.amountCents, 0);
  const paidThisMonth = SAMPLE_ACCOUNTS_PAYABLE.filter(
    (item) => item.status === "paid" && item.paidAtISO !== undefined && isSameMonth(item.paidAtISO, NOW_ANCHOR),
  );
  const paidThisMonthCents = paidThisMonth.reduce((sum, item) => sum + item.amountCents, 0);

  return (
    <div className="flex flex-col gap-8 p-6">
      <PageHeader
        title="Financeiro"
        description="Ledger, AP/AR, conciliação, settlements, DRE, projeção. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <section aria-labelledby="ap-heading" className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between">
          <h2 id="ap-heading" className="text-lg font-semibold text-fg">
            Contas a pagar
          </h2>
          <a href="/financeiro/dre" className="text-xs text-fg-muted underline underline-offset-2 hover:text-fg">
            Ver DRE →
          </a>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Contas a pagar pendentes" value={String(pending.length)} trend={pending.length > 0 ? "down" : "flat"} />
          <KpiCard label="Valor total pendente" value={format(money(totalPendingCents, "BRL"))} />
          <KpiCard label="Pagas no mês" value={String(paidThisMonth.length)} trend="flat" />
          <KpiCard label="Valor pago no mês" value={format(money(paidThisMonthCents, "BRL"))} trend="up" />
        </div>

        {SAMPLE_ACCOUNTS_PAYABLE.length > 0 ? (
          <AccountsPayableList items={SAMPLE_ACCOUNTS_PAYABLE} vendors={SAMPLE_VENDORS} />
        ) : (
          <EmptyState message="Nenhuma conta a pagar registrada." />
        )}
      </section>

      {/* Seção de DRE (faixa paralela — apps/console/app/(staff)/financeiro/dre) entra aqui como
          uma <section> irmã, sem tocar na seção de AP acima. */}
    </div>
  );
}
