// Visão geral de Equipe (Fase 9, Passo 4b — docs/fase-atual.md; seção 9.10 do prompt único).
// Reescreve o placeholder da Fase 1 (só 4 KpiCard vazios) por KPIs reais sobre amostra + links
// para as sub-rotas. Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres
// vivo nesta máquina (Docker Desktop parado, "Gap conhecido 2"), mesmo padrão de
// apps/console/app/(staff)/limpeza/page.tsx e .../estoque/page.tsx. O CAMINHO DE ESCRITA
// (./actions.ts, chamado a partir de ./escala/page.tsx) já é real, contra o banco via
// `withTenant`.
import Link from "next/link";
import { KpiCard } from "@titan/ui";
import { activeCredentialsForMember } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { SAMPLE_ACCESS_CREDENTIAL_CHAIN, SAMPLE_MEMBERS, SAMPLE_SHIFT_ASSIGNMENTS } from "./sample-data";

export default function EquipePage() {
  const activeMembers = SAMPLE_MEMBERS.filter((member) => member.status === "active");
  const dismissedMembers = SAMPLE_MEMBERS.filter((member) => member.status === "dismissed");

  // Soma de `activeCredentialsForMember` (packages/domain/src/workforce/access-custody.ts) sobre
  // TODOS os membros — nunca um contador mutável separado, mesmo princípio de I10 aplicado à
  // custódia de acesso: a única fonte de verdade é a cadeia inteira, recalculada aqui.
  const activeCredentialsCount = SAMPLE_MEMBERS.reduce(
    (total, member) => total + activeCredentialsForMember(SAMPLE_ACCESS_CREDENTIAL_CHAIN, member.id).length,
    0,
  );

  const pendingShifts = SAMPLE_SHIFT_ASSIGNMENTS.filter((assignment) => assignment.status === "proposed").length;

  return (
    <div className="p-6">
      <PageHeader
        title="Equipe"
        description="Cadastro, escala, custódia de acesso e produtividade da equipe de campo. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Membros ativos" value={String(activeMembers.length)} />
        <KpiCard label="Credenciais ativas" value={String(activeCredentialsCount)} />
        <KpiCard
          label="Escalas pendentes de resposta"
          value={String(pendingShifts)}
          trend={pendingShifts > 0 ? "down" : "flat"}
        />
        {/* "no mês" não é filtrável de verdade nesta fase: `workforce_members` não tem coluna
            `dismissedAt` (packages/db/src/schema/workforce-member.ts só tem `status`) — mesma
            disciplina de "nunca inventar um dado que não existe" já usada para "Contagens
            pendentes" em apps/console/app/(staff)/estoque/page.tsx. A contagem abaixo é TODOS os
            desligamentos da amostra, não filtrada por mês — documentado no rótulo. */}
        <KpiCard label="Desligamentos (total da amostra)" value={String(dismissedMembers.length)} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/equipe/escala"
          className="rounded-control border border-border bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors duration-100 hover:bg-surface-2"
        >
          Escala e custódia de acesso →
        </Link>
        {/* A próxima faixa (produtividade, Passo 4c) cria ./produtividade/page.tsx depois desta —
            o link abaixo fica quebrado (404) até lá, deliberadamente (ver prompt desta faixa). */}
        <Link
          href="/equipe/produtividade"
          className="rounded-control border border-border bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors duration-100 hover:bg-surface-2"
        >
          Produtividade →
        </Link>
      </div>
    </div>
  );
}
