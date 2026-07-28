// Cockpit de distribuição (Fase 3, Passo 4d — docs/fase-atual.md; seção 9.2 do prompt único:
// painel "Saúde da Distribuição" — lag por canal, taxa de erro, divergência, DLQ, kill switch).
//
// Dados exibidos são AMOSTRA ESTÁTICA (./sample-data.ts) — não há Postgres vivo nesta máquina
// (Docker Desktop parado, "Gap conhecido 2" de docs/fase-atual.md), então esta página Server
// Component não consulta `packages/db` para LER ainda — mesmo padrão de
// apps/console/app/(staff)/aprovacoes/page.tsx. As contagens dos KPI cards abaixo são, ainda
// assim, CALCULADAS de verdade sobre a amostra (não são "0" hardcoded) com a MESMA lógica que uma
// query real usaria (filtrar por status, contar, pegar o máximo de created_at) — trocar a fonte
// por `withTenant(...).select()...` quando o banco estiver de pé é a única mudança necessária,
// nunca a lógica de contagem.
//
// O CAMINHO DE ESCRITA (`resolveDivergenceAction`, `retrySyncAction`, `toggleChannelAdapterAction`
// — ./actions.ts, chamados pelos client components abaixo) já é real, contra o banco via
// `withTenant` — a distinção importa: resolver divergência/reprocessar aqui não é mock, é a
// Server Action de verdade que só não encontra a linha porque o banco não está de pé nesta sessão.
import { KpiCard } from "@titan/ui";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { DivergenceList } from "./DivergenceList";
import { DlqQueue } from "./DlqQueue";
import { ChannelKillSwitchPanel } from "./ChannelKillSwitchPanel";
import {
  ALL_CHANNELS,
  SAMPLE_CHANNEL_SYNC_LOG,
  SAMPLE_DIVERGENCES,
  SAMPLE_LISTING_MAPPINGS,
} from "./sample-data";

// Janela de "recente" para a fila DLQ do KPI card — itens de erro fora desta janela ainda
// aparecem na lista abaixo (histórico), mas não inflam o número do card com erro antigo já
// tratado/expirado. 24h escolhido por ser o mesmo ciclo de "reserva de OTA bloqueia outros canais
// em <5 min; divergência detectada" do portão de saída da Fase 3 (docs/roadmap.md) — folga
// generosa o bastante para cobrir um fim de semana sem alguém olhar o cockpit, sem deixar erro de
// semanas atrás poluir o número do dia.
const DLQ_RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const LAST_SYNC_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default function DistribuicaoPage() {
  const nowEpochMs = Date.parse("2026-07-28T14:00:00Z"); // mesma âncora determinística da amostra.

  const openDivergences = SAMPLE_DIVERGENCES.filter((d) => d.status === "open");

  const connectedChannels = new Set(SAMPLE_LISTING_MAPPINGS.map((m) => m.channel));

  const recentDlqEntries = SAMPLE_CHANNEL_SYNC_LOG.filter(
    (entry) => entry.status === "error" && nowEpochMs - entry.createdAt.getTime() <= DLQ_RECENT_WINDOW_MS,
  );

  const lastSyncEntry = SAMPLE_CHANNEL_SYNC_LOG.reduce<(typeof SAMPLE_CHANNEL_SYNC_LOG)[number] | undefined>(
    (latest, entry) => (!latest || entry.createdAt > latest.createdAt ? entry : latest),
    undefined,
  );

  return (
    <div className="p-6">
      <PageHeader
        title="Distribuição"
        description="Saúde dos canais, mapeamentos, divergências, DLQ. Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md)."
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Canais conectados" value={String(connectedChannels.size)} />
        <KpiCard
          label="Divergências abertas"
          value={String(openDivergences.length)}
          trend={openDivergences.length > 0 ? "down" : "flat"}
        />
        <KpiCard
          label="Fila DLQ (24h)"
          value={String(recentDlqEntries.length)}
          trend={recentDlqEntries.length > 0 ? "down" : "flat"}
        />
        <KpiCard
          label="Última sincronização"
          value={lastSyncEntry ? LAST_SYNC_FORMATTER.format(lastSyncEntry.createdAt) : "—"}
          state={lastSyncEntry ? "ready" : "empty"}
        />
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Divergências abertas</h2>
        {openDivergences.length > 0 ? (
          <DivergenceList divergences={openDivergences} />
        ) : (
          <EmptyState message="Nenhuma divergência aberta." />
        )}
      </div>

      <div className="mb-6">
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Fila DLQ — itens com falha de sincronização</h2>
        {recentDlqEntries.length > 0 ? (
          <DlqQueue entries={recentDlqEntries} />
        ) : (
          <EmptyState message="Nenhum item na DLQ nas últimas 24h." />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Kill switch por canal</h2>
        <ChannelKillSwitchPanel channels={ALL_CHANNELS} connectedChannels={connectedChannels} />
      </div>
    </div>
  );
}
