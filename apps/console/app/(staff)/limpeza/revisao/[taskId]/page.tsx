// Painel de revisão fotográfica (Fase 6, Passo 4d — docs/fase-atual.md, seção 9.8.1 do prompt
// único) — I10 (evidência append-only, sem rota de exclusão para papel algum) e I9 (unidade só
// libera para `ready` com evidência suficiente, seção 9.9). Server Component: tenta a leitura REAL
// (./queries.ts::getCleaningTaskReview) contra o banco via `withTenant`; sem Postgres vivo nesta
// máquina (Docker Desktop parado — Gap conhecido 2, docs/fase-atual.md), a chamada lança erro de
// conexão (ou a sessão real também não existe fora de um browser autenticado) e caímos para
// ./sample-data.ts — mesmo padrão de degradação graciosa já usado em
// apps/console/app/(staff)/aprovacoes e .../fiscal, adaptado para uma rota de DETALHE (o
// `taskId` da URL é usado para escolher qual amostra mostrar, quando ele bate com um id conhecido;
// caso contrário cai na amostra padrão, só para o painel nunca ficar vazio nesta fase).
import { isClaimDeadlineAtRisk, isClaimDeadlineExpired } from "@titan/domain";
import { PageHeader } from "@/components/PageHeader";
import { StatusPill } from "@titan/ui";
import { ReviewPanel, type ClaimDeadlineDisplayStatus } from "./ReviewPanel";
import { getCleaningTaskReview, type CleaningTaskReview } from "./queries";
import { DEFAULT_SAMPLE_TASK_ID, SAMPLE_CLEANING_TASK_REVIEWS } from "./sample-data";

// Janela de aviso do prazo de sinistro — "em risco" quando faltam menos de 12h para o prazo
// vencer. Valor de exemplo (não confirmado por docs/decisoes-de-negocio.md, que não cobre isto
// explicitamente); ajustável quando a operação real definir a janela de alarme desejada.
const CLAIM_DEADLINE_WARNING_WINDOW_MS = 12 * 60 * 60 * 1000;

async function loadReview(taskId: string): Promise<{ review: CleaningTaskReview; isSampleData: boolean }> {
  try {
    const real = await getCleaningTaskReview(taskId);
    if (real) {
      return { review: real, isSampleData: false };
    }
  } catch {
    // Sem sessão real (fora de um browser autenticado) ou sem Postgres vivo (Gap conhecido 2) —
    // cai para amostra abaixo, sem propagar o erro para a página inteira.
  }

  const sample = SAMPLE_CLEANING_TASK_REVIEWS[taskId] ?? SAMPLE_CLEANING_TASK_REVIEWS[DEFAULT_SAMPLE_TASK_ID]!;
  return { review: sample, isSampleData: true };
}

const STATUS_LABEL: Record<string, string> = {
  cleaning: "Em limpeza",
  clean: "Aguardando revisão",
  inspected: "Inspecionada",
  rework: "Em retrabalho",
};

export default async function RevisaoLimpezaPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const { review, isSampleData } = await loadReview(taskId);

  let claimDeadlineStatus: ClaimDeadlineDisplayStatus | null = null;
  if (review.claimDeadline.kind === "resolved") {
    const nowEpochMs = Date.now();
    const { deadlineEpochMs } = review.claimDeadline.info;
    claimDeadlineStatus = {
      nowEpochMs,
      isAtRisk: isClaimDeadlineAtRisk(deadlineEpochMs, nowEpochMs, CLAIM_DEADLINE_WARNING_WINDOW_MS),
      isExpired: isClaimDeadlineExpired(deadlineEpochMs, nowEpochMs),
    };
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Revisão fotográfica"
        description={`Tarefa de limpeza ${review.cleaningTaskId} — unidade ${review.unitId}.`}
      />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusPill tone={review.status === "rework" ? "negative" : "info"}>
          {STATUS_LABEL[review.status] ?? review.status}
        </StatusPill>
        <span className="text-sm text-fg-muted">Executada por: {review.assignedTo}</span>
      </div>

      <ReviewPanel review={review} claimDeadlineStatus={claimDeadlineStatus} isSampleData={isSampleData} />
    </div>
  );
}
