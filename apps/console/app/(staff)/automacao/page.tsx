// Console de automação (Fase 10, Passo 4b — docs/fase-atual.md). Reescrita do placeholder da
// Fase 1. DESIGN.md "Agent Action Badge": toda ação de agente rotulada (`agent:<nome> v<versão>`),
// nunca auto-executando consequência financeira/fiscal (PRODUCT.md Positioning). A outra faixa
// paralela desta fase (catálogo `titan-mcp-prod`, apps/mcp/**) roda em separado — esta tela só
// LÊ/RESUME o que a Fase 10, Passo 2 já modelou em packages/db (agent_conversations/agent_traces/
// golden_set_runs/agent_kill_switches) e a fila real de aprovações já existente desde a Fase 2
// (apps/console/app/(staff)/aprovacoes) — nunca uma segunda implementação da fila.
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Gap conhecido 2, docs/fase-atual.md); ./queries.ts já tem o caminho de LEITURA real, mesmo
// padrão de apps/console/app/(staff)/pricing. O kill switch (./AgentKillSwitchList.tsx) chama a
// Server Action real (./actions.ts::toggleAgentKillSwitchAction) — não é mock, só não encontra
// linha porque o banco não está de pé nesta sessão.
import Link from "next/link";
import { format, money } from "@titan/money";
import { KpiCard, StatusPill } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { AgentKillSwitchList } from "./AgentKillSwitchList";
import {
  SAMPLE_AGENT_ACTION_APPROVALS,
  SAMPLE_AGENT_CONVERSATIONS,
  SAMPLE_AGENT_KILL_SWITCHES,
  SAMPLE_AGENT_TRACES,
  SAMPLE_GOLDEN_SET_RUNS,
  type SampleAgentConversation,
} from "./sample-data";

// Os 12 guardrails do ADR-0009 (docs/adr/0009-hardening-agentes.md) — listados ESTATICAMENTE
// (nunca reexecutados nesta tela): são estruturais (container, credencial, rede, versão travada),
// não uma configuração que a UI liga/desliga. "Regra em prompt é pedido; hook/infra é bloqueio"
// (docs/invariantes.md, "Regra de ouro") — o console só declara o que já está em vigor.
const GUARDRAILS = [
  { n: 1, label: "Instância com conteúdo não confiável nunca tem ferramenta de escrita" },
  { n: 2, label: "Uma instância por papel, container separado, credencial própria" },
  { n: 3, label: "Sem shell/exec em instância com credencial Titan" },
  { n: 4, label: "Allowlist de staff para canais de mensageria — hóspede nunca aponta para elas" },
  { n: 5, label: "Versão travada + SLA de patch 72h para CVE de severidade alta" },
  { n: 6, label: "Skill autogerada desabilitada para qualquer coisa que toque a Titan" },
  { n: 7, label: "Orçamento por instância (tokens, CPU/memória, rate limit de provedor)" },
  { n: 8, label: "Memória efêmera e não confiável — Postgres é a fonte de verdade" },
  { n: 9, label: "Rede isolada, egress allowlist (só provedor LLM + MCP + mensageria)" },
  { n: 10, label: "Nada irreversível sem confirmação (cancelar reserva, revogar acesso, publicar em canal)" },
  { n: 11, label: "Fiscal/dinheiro: agente enfileira e propõe — nunca emite/cancela nota ou executa PIX" },
  { n: 12, label: "Transparência: identifica-se como assistente, respeita janela de 24h do WhatsApp" },
] as const;

const TRACE_ROLE_LABEL: Record<string, string> = {
  user: "Hóspede/usuário",
  agent: "Agente",
  tool: "Ferramenta",
};

const DATETIME_FORMATTER = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

function formatAccuracy(basisPoints: number): string {
  return `${(basisPoints / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function tracesFor(conversation: SampleAgentConversation) {
  return SAMPLE_AGENT_TRACES.filter((trace) => trace.conversationId === conversation.id);
}

export default function AutomacaoPage() {
  const conversationsToday = SAMPLE_AGENT_CONVERSATIONS.length;
  const costTodayCents = SAMPLE_AGENT_TRACES.reduce((sum, trace) => sum + trace.costCents, 0);
  const latestGoldenSetRun = SAMPLE_GOLDEN_SET_RUNS.slice().sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
  const pendingAgentActions = SAMPLE_AGENT_ACTION_APPROVALS.filter((request) => request.status === "pending");

  return (
    <div className="p-6">
      <PageHeader
        title="Automação"
        description="Console de agentes — o modelo propõe, o humano decide. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Conversas hoje" value={String(conversationsToday)} />
        <KpiCard label="Custo acumulado hoje" value={format(money(costTodayCents, "BRL"))} />
        {latestGoldenSetRun ? (
          <KpiCard
            label={`Acurácia golden-set (${latestGoldenSetRun.agentName} ${latestGoldenSetRun.agentVersion})`}
            value={formatAccuracy(latestGoldenSetRun.accuracyBasisPoints)}
            trend={latestGoldenSetRun.metTarget ? "up" : "down"}
          />
        ) : (
          <KpiCard label="Acurácia golden-set" state="empty" />
        )}
        <KpiCard
          label="Ações de agente pendentes"
          value={String(pendingAgentActions.length)}
          trend={pendingAgentActions.length > 0 ? "down" : "flat"}
        />
      </div>

      <div className="mb-6 rounded-card border border-border bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-label text-fg-muted">Fila de ações de agente (resumo)</div>
          <Link href="/aprovacoes" className="text-xs font-medium text-accent hover:underline">
            Decidir na fila de Aprovações →
          </Link>
        </div>
        {pendingAgentActions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-label text-fg-muted">
                  <th className="px-3 py-2 font-medium">Solicitado por</th>
                  <th className="px-3 py-2 font-medium">Motivo</th>
                  <th className="px-3 py-2 font-medium">Risco</th>
                  <th className="px-3 py-2 font-medium">Prazo (SLA)</th>
                </tr>
              </thead>
              <tbody>
                {pendingAgentActions.map((request) => (
                  <tr key={request.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 align-top font-mono text-xs text-fg-muted">{request.requestedBy}</td>
                    <td className="px-3 py-2 align-top max-w-md text-fg-muted">{request.rationale}</td>
                    <td className="px-3 py-2 align-top">
                      <StatusPill
                        tone={request.risk === "high" ? "negative" : request.risk === "medium" ? "warning" : "info"}
                      >
                        {request.risk === "high" ? "Alto" : request.risk === "medium" ? "Médio" : "Baixo"}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-2 align-top tabular-figures">
                      {DATETIME_FORMATTER.format(request.slaAtEpochMs)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState message="Nenhuma ação de agente pendente." />
        )}
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-3 text-label text-fg-muted">Feed de trace (últimas conversas)</div>
          <div className="flex flex-col gap-4">
            {SAMPLE_AGENT_CONVERSATIONS.map((conversation) => (
              <div key={conversation.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
                <div className="mb-1.5 flex items-center gap-2 text-xs text-fg-muted">
                  <span className="font-mono text-fg">
                    agent:{conversation.agentName} v{conversation.agentVersion}
                  </span>
                  <StatusPill tone="info">{conversation.plane === "operator" ? "Operador" : "Plataforma"}</StatusPill>
                  <span>{DATETIME_FORMATTER.format(conversation.startedAt)}</span>
                </div>
                <ul className="flex flex-col gap-1 text-sm">
                  {tracesFor(conversation).map((trace) => (
                    <li key={trace.id} className="text-fg-muted">
                      <span className="font-medium text-fg">{TRACE_ROLE_LABEL[trace.role] ?? trace.role}:</span>{" "}
                      {trace.contentRedacted}
                      {trace.toolName ? (
                        <span className="ml-1 font-mono text-xs text-fg-muted">[{trace.toolName}]</span>
                      ) : null}
                      <span className="ml-1 tabular-figures text-xs text-fg-muted">
                        · {format(money(trace.costCents, "BRL"))} · {trace.latencyMs}ms
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-card border border-border bg-surface p-5">
          <div className="mb-3 text-label text-fg-muted">Guardrails (ADR-0009) — estruturais, não configuráveis</div>
          <ul className="flex flex-col gap-2 text-sm">
            {GUARDRAILS.map((guardrail) => (
              <li key={guardrail.n} className="flex items-center justify-between gap-3">
                <span className="text-fg-muted">
                  <span className="font-mono text-xs text-fg">#{guardrail.n}</span> {guardrail.label}
                </span>
                <StatusPill tone="positive">Ativo</StatusPill>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <div className="mb-3 text-label text-fg-muted">Kill switch por agente</div>
        <AgentKillSwitchList killSwitches={SAMPLE_AGENT_KILL_SWITCHES} />
      </div>
    </div>
  );
}
