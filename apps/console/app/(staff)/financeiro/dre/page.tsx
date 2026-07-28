// DRE (Demonstração de Resultado) gerencial simplificado — Fase 5 (Financeiro), Passo 4d
// (docs/fase-atual.md). Sub-rota NOVA e disjunta de `apps/console/app/(staff)/financeiro/`
// (rota-pai, faixa paralela diferente construindo `page.tsx`/`actions.ts` de AP naquele
// diretório) — nenhum arquivo em comum, ver docs/anti-padroes.md #21 (duas faixas escrevendo no
// mesmo diretório).
//
// Server Component que lê `searchParams` (form GET simples: início/fim/unidade) e chama
// `computeDreForPeriod` (./queries.ts) diretamente, dentro de `withTenant`. Autoriza com a mesma
// ability CASL (`read`/`ledger`) que `titan.finance` já tem em `packages/auth/src/abilities.ts` —
// mesmo padrão de porta de entrada usado nas Server Actions (`apps/console/lib/auth/session.ts`),
// aplicado aqui a uma leitura em vez de uma mutação, porque o dado é financeiro sensível mesmo
// sendo só leitura.
//
// LIMITAÇÃO CONHECIDA (mesma classe do "Gap conhecido 2" de docs/fase-atual.md): sem Postgres
// vivo nesta máquina, qualquer tentativa real de consulta falha na conexão — a página trata isso
// como estado de erro explícito (nunca finge um relatório vazio como se fosse "zero movimento").
import Link from "next/link";
import { format, money } from "@titan/money";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";
import { computeDreForPeriod, listUnitsForTenant, type DreLine, type DreReport, type UnitOption } from "./queries";
import type { Cents } from "@titan/domain";

interface DreSearchParams {
  start?: string;
  end?: string;
  unitId?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Primeiro e último dia (ambos inclusivos, forma que o usuário espera ver num formulário) do mês
 * corrente em UTC — âncora só para o valor DEFAULT dos campos de data; o usuário pode trocar
 * livremente. */
function defaultPeriod(): { startISO: string; endISO: string } {
  const now = new Date();
  const firstDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { startISO: toISODate(firstDay), endISO: toISODate(lastDay) };
}

/** `computeDreForPeriod` espera limite superior EXCLUSIVO (ver ./queries.ts) — o campo "fim" do
 * formulário é inclusivo do ponto de vista do usuário ("até 31/07"), então somamos +1 dia aqui,
 * na borda, antes de chamar a query. Nunca duplicar essa conversão dentro de queries.ts. */
function toExclusiveEndISO(inclusiveEndISO: string): string {
  const asDate = new Date(`${inclusiveEndISO}T00:00:00.000Z`);
  asDate.setUTCDate(asDate.getUTCDate() + 1);
  return toISODate(asDate);
}

function DreLineRow({ line }: { line: DreLine }) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-4 text-sm text-fg-muted">{line.accountCode}</td>
      <td className="py-2 pr-4 text-sm text-fg">{line.accountName}</td>
      <td className="py-2 text-right text-sm tabular-figures text-fg">
        {format(money(line.totalCents, "BRL"))}
      </td>
    </tr>
  );
}

function DreLinesTable({ title, lines, totalCents }: { title: string; lines: DreLine[]; totalCents: Cents }) {
  return (
    <div className="rounded-card border border-border bg-surface p-6">
      <h2 className="mb-3 text-sm font-medium text-fg-muted">{title}</h2>
      {lines.length === 0 ? (
        <EmptyState message={`Nenhum lançamento de ${title.toLowerCase()} no período selecionado.`} />
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 pr-4 text-label text-fg-muted">Conta</th>
              <th className="pb-2 pr-4 text-label text-fg-muted">Nome</th>
              <th className="pb-2 text-right text-label text-fg-muted">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <DreLineRow key={line.accountCode} line={line} />
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 pr-4 text-sm font-medium text-fg" colSpan={2}>
                Total {title.toLowerCase()}
              </td>
              <td className="pt-3 text-right text-sm font-medium tabular-figures text-fg">
                {format(money(totalCents, "BRL"))}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  );
}

function ReportBody({ report }: { report: DreReport }) {
  const isPositive = report.netResultCents >= 0;
  return (
    <div className="space-y-4">
      <DreLinesTable title="Receitas" lines={report.revenueLines} totalCents={report.totalRevenueCents} />
      <DreLinesTable title="Despesas" lines={report.expenseLines} totalCents={report.totalExpenseCents} />
      <div className="flex items-center justify-between rounded-card border border-border bg-surface p-6">
        <span className="text-sm font-medium text-fg-muted">Resultado líquido do período</span>
        <span
          className={`text-lg font-semibold tabular-figures ${isPositive ? "text-positive" : "text-negative"}`}
        >
          {format(money(report.netResultCents, "BRL"))}
        </span>
      </div>
    </div>
  );
}

export default async function DrePage({
  searchParams,
}: {
  searchParams: Promise<DreSearchParams>;
}) {
  const params = await searchParams;
  const defaults = defaultPeriod();
  const startISO = params.start ?? defaults.startISO;
  const endISOInclusive = params.end ?? defaults.endISO;
  const unitId = params.unitId && params.unitId.length > 0 ? params.unitId : undefined;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    const message =
      err instanceof UnauthenticatedError || err instanceof NoActiveTenantError
        ? err.message
        : "Falha ao verificar sessão.";
    return (
      <div className="p-6">
        <PageHeader title="DRE" description="Demonstração de Resultado gerencial, por unidade e por carteira." />
        <EmptyState message={message} />
      </div>
    );
  }

  if (session.ability.cannot("read", "ledger")) {
    return (
      <div className="p-6">
        <PageHeader title="DRE" description="Demonstração de Resultado gerencial, por unidade e por carteira." />
        <EmptyState message="Sem permissão para consultar o DRE com o papel atual." />
      </div>
    );
  }

  let report: DreReport | null = null;
  let unitOptions: UnitOption[] = [];
  let loadError: string | null = null;
  try {
    const [reportResult, unitsResult] = await Promise.all([
      computeDreForPeriod({
        tenantId: session.tenantId,
        actorId: session.userId,
        periodStartISO: startISO,
        periodEndISO: toExclusiveEndISO(endISOInclusive),
        ...(unitId !== undefined ? { unitId } : {}),
      }),
      listUnitsForTenant({ tenantId: session.tenantId, actorId: session.userId }),
    ]);
    report = reportResult;
    unitOptions = unitsResult;
  } catch {
    // Sem Postgres vivo nesta máquina (mesma classe do "Gap conhecido 2" de docs/fase-atual.md) —
    // ou qualquer outra falha real de leitura. Nunca mostramos "zero movimento" fingido: erro
    // explícito, nunca sucesso silencioso.
    loadError =
      "Não foi possível consultar o ledger agora (sem Postgres vivo nesta máquina ou outra falha de leitura). " +
      "Ver docs/fase-atual.md, Gap conhecido 2.";
  }

  return (
    <div className="p-6">
      <PageHeader title="DRE" description="Demonstração de Resultado gerencial, por unidade e por carteira." />

      <form method="get" className="mb-6 flex flex-wrap items-end gap-4 rounded-card border border-border bg-surface p-6">
        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Início</span>
          <input
            type="date"
            name="start"
            defaultValue={startISO}
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm tabular-figures text-fg"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Fim</span>
          <input
            type="date"
            name="end"
            defaultValue={endISOInclusive}
            className="w-full rounded-control border border-border bg-surface-2 px-3 py-2 text-sm tabular-figures text-fg"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-label text-fg-muted">Unidade</span>
          <select
            name="unitId"
            defaultValue={unitId ?? ""}
            className="w-full min-w-[12rem] rounded-control border border-border bg-surface-2 px-3 py-2 text-sm text-fg"
          >
            <option value="">Todas as unidades (carteira)</option>
            {unitOptions.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-control bg-accent px-5 py-2 text-sm font-medium text-accent-fg hover:brightness-95"
        >
          Aplicar
        </button>
        <Link href="/financeiro" className="ml-auto text-sm text-fg-muted underline-offset-4 hover:underline">
          ← Voltar para Financeiro
        </Link>
      </form>

      {loadError ? <EmptyState message={loadError} /> : report ? <ReportBody report={report} /> : null}
    </div>
  );
}
