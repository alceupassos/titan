"use client";

// Painel interativo de revisão fotográfica (Fase 6, Passo 4d — docs/fase-atual.md, seção 9.8.1 do
// prompt único). Client component porque a decisão tem estado próprio (campo de observação/motivo,
// transição pendente, resultado da decisão) — mesmo padrão de
// apps/console/app/(staff)/aprovacoes/ApprovalQueueTable.tsx.
//
// IMPORTANTE: a garantia real de I10/seção 9.9 (não liberar a unidade sem evidência suficiente)
// NÃO está aqui — está em ./actions.ts::decideReviewAction, que chama
// `enforceAssuranceLevel(nivel, "release_ready")` no servidor antes de qualquer UPDATE. Esta UI só
// desabilita/avisa como conveniência (Anti-padrão do DESIGN.md "Absence of a button is not
// security" — o botão "Aprovar" abaixo permanece CLICÁVEL mesmo quando a evidência é insuficiente,
// de propósito: clicar chama a Server Action de verdade, que recusa e devolve o erro claro. Nunca
// escondemos o botão para simular uma autorização que só o servidor decide.
import { useState, useTransition } from "react";
import { StatusPill, Button, type StatusTone } from "@titan/ui";
import type { AssuranceLevel } from "@titan/domain";
import type { CleaningTaskReview } from "./queries";
import { decideReviewAction } from "./actions";

const ASSURANCE_TONE: Record<AssuranceLevel, StatusTone> = {
  A0: "negative",
  A1: "info",
  A2: "positive",
  A3: "positive",
};

const ASSURANCE_LABEL: Record<AssuranceLevel, string> = {
  A0: "A0 — sem garantia (sem app instalado)",
  A1: "A1 — evidência básica",
  A2: "A2 — vistoria em app instalado",
  A3: "A3 — vistoria com testemunha adicional",
};

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDuration(ms: number): string {
  const totalMinutes = Math.round(Math.abs(ms) / (60 * 1000));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes}min`;
}

export interface ClaimDeadlineDisplayStatus {
  readonly isAtRisk: boolean;
  readonly isExpired: boolean;
  readonly nowEpochMs: number;
}

export interface ReviewPanelProps {
  review: CleaningTaskReview;
  claimDeadlineStatus: ClaimDeadlineDisplayStatus | null;
  isSampleData: boolean;
}

type Decision = "approve" | "approve_with_note" | "reject";

export function ReviewPanel({ review, claimDeadlineStatus, isSampleData }: ReviewPanelProps) {
  const [decision, setDecision] = useState<Decision | undefined>(undefined);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message: string } | undefined>(undefined);

  function submit(): void {
    if (!decision) return;
    startTransition(async () => {
      const outcome = await decideReviewAction({
        cleaningTaskId: review.cleaningTaskId,
        decision,
        note: note.trim().length > 0 ? note : undefined,
      });
      if (outcome.ok) {
        setResult({ ok: true, message: `Decisão registrada: ${outcome.data.cleaningTaskStatus}.` });
      } else {
        setResult({ ok: false, message: outcome.error });
      }
    });
  }

  const requiresNote = decision === "reject";
  const canSubmit = decision != null && (!requiresNote || note.trim().length > 0) && !isPending;

  return (
    <div className="flex flex-col gap-6">
      {isSampleData ? (
        <p className="rounded-card border border-border bg-surface-2 p-3 text-xs text-fg-muted">
          Dados de amostra (sem Postgres vivo nesta máquina; ver docs/fase-atual.md) — a decisão
          abaixo chama a Server Action real e, sem banco, falha com erro de conexão. Isso é
          esperado nesta fase, não um bug do painel.
        </p>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Evidência da tarefa</h2>
        {review.evidence.length === 0 ? (
          <div className="rounded-card border border-border bg-surface p-6 text-center text-sm text-fg-muted">
            Nenhuma captura de evidência registrada para esta tarefa ainda.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {review.evidence.map((piece) => (
              <div
                key={piece.entryHash}
                className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4"
              >
                {/* Placeholder de imagem — sem bucket real (packages/evidence, faixa paralela),
                    NUNCA a foto de verdade. Mostra o contentHash como prova de proveniência. */}
                <div className="flex h-24 items-center justify-center rounded-control border border-dashed border-border bg-surface-2 font-mono text-[10px] text-fg-muted">
                  sha256:{piece.contentHash.slice(0, 16)}…
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-fg">{piece.room}</span>
                  <span title={ASSURANCE_LABEL[piece.assuranceLevel]}>
                    <StatusPill tone={ASSURANCE_TONE[piece.assuranceLevel]}>{piece.assuranceLevel}</StatusPill>
                  </span>
                </div>
                <span className="text-xs text-fg-muted">
                  {TIMESTAMP_FORMATTER.format(piece.capturedAtEpochMs)}
                </span>
                {piece.discarded ? (
                  <StatusPill tone="negative">Descartada (I10 — permanece na cadeia)</StatusPill>
                ) : null}
              </div>
            ))}
          </div>
        )}
        <p className="mt-2 text-xs text-fg-muted">
          Nível mínimo exigido para liberar a unidade: A1 (seção 9.9) — verificado pelo servidor em
          ./actions.ts, nunca só por esta tela.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Prazo de sinistro</h2>
        {review.claimDeadline.kind === "resolved" && claimDeadlineStatus ? (
          <div className="flex items-center gap-3 rounded-card border border-border bg-surface p-4">
            <StatusPill
              tone={
                claimDeadlineStatus.isExpired ? "negative" : claimDeadlineStatus.isAtRisk ? "warning" : "positive"
              }
            >
              {claimDeadlineStatus.isExpired
                ? "Prazo vencido"
                : claimDeadlineStatus.isAtRisk
                  ? "Prazo em risco"
                  : "Prazo confortável"}
            </StatusPill>
            <span className="tabular-figures text-sm text-fg">
              {claimDeadlineStatus.isExpired
                ? `Venceu há ${formatDuration(review.claimDeadline.info.deadlineEpochMs - claimDeadlineStatus.nowEpochMs)}`
                : `Vence em ${formatDuration(review.claimDeadline.info.deadlineEpochMs - claimDeadlineStatus.nowEpochMs)}`}
            </span>
            <span className="text-xs text-fg-muted">canal: {review.claimDeadline.info.channel}</span>
            <Button
              variant="ghost"
              type="button"
              disabled
              title="TODO — abrir dossiê de sinistro completo (claim_dossiers) não implementado nesta faixa (Passo 4d); fica para faixa dedicada de sinistro/dossiê."
            >
              Abrir dossiê de sinistro
            </Button>
          </div>
        ) : (
          <EmptyClaimDeadlineNote resolution={review.claimDeadline} />
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-fg-muted">Decisão</h2>
        <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={decision === "approve" ? "primary" : "ghost"}
              disabled={isPending}
              onClick={() => setDecision("approve")}
            >
              Aprovar
            </Button>
            <Button
              type="button"
              variant={decision === "approve_with_note" ? "primary" : "ghost"}
              disabled={isPending}
              onClick={() => setDecision("approve_with_note")}
            >
              Aprovar com observação
            </Button>
            <Button
              type="button"
              variant={decision === "reject" ? "primary" : "ghost"}
              disabled={isPending}
              onClick={() => setDecision("reject")}
            >
              Reprovar (rework)
            </Button>
          </div>

          {decision === "approve_with_note" || decision === "reject" ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                requiresNote
                  ? "Motivo obrigatório — aponte o item específico do checklist que reprovou (anti-padrão #13)."
                  : "Observação (opcional)."
              }
              rows={3}
              className="w-full rounded-control border border-border bg-bg p-2 text-sm text-fg placeholder:text-fg-muted focus-visible:outline-2 focus-visible:outline-accent"
            />
          ) : null}

          <Button type="button" disabled={!canSubmit} onClick={submit} className="self-start">
            Confirmar decisão
          </Button>

          {result ? (
            <p className={`text-sm ${result.ok ? "text-positive" : "text-negative"}`}>{result.message}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function EmptyClaimDeadlineNote({ resolution }: { resolution: CleaningTaskReview["claimDeadline"] }) {
  let message: string;
  switch (resolution.kind) {
    case "no-reservation":
      message =
        "Nenhuma reserva recente encontrada para esta unidade — não é possível calcular prazo de sinistro (bounded context housekeeping/booking ainda não vincula virada a reserva explicitamente, ver ./queries.ts).";
      break;
    case "no-rule":
      message = `Nenhuma channel_claim_rule vigente para o canal "${resolution.channel}" — cadastre a regra antes de calcular o prazo (docs/anti-padroes.md #6).`;
      break;
    case "ambiguous-rule":
      message = `Vigências de channel_claim_rule sobrepostas para o canal "${resolution.channel}" — ambiguidade não resolvida automaticamente.`;
      break;
    default:
      // "resolved" nunca chega aqui — ReviewPanel só renderiza este componente quando
      // `review.claimDeadline.kind !== "resolved"` (ver seção "Prazo de sinistro" acima).
      message = "Prazo de sinistro resolvido.";
  }

  return <div className="rounded-card border border-border bg-surface p-4 text-sm text-fg-muted">{message}</div>;
}
