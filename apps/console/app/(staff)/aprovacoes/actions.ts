"use server";

// Server Action de decisão da fila central de aprovações (Fase 2, Passo 4 — docs/fase-atual.md,
// seção 9.4.2 do prompt único: "nada de aprovação por chat", rejeição sempre exige comentário).
// Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza (CASL) dentro dela
// mesma" — a função abaixo faz as duas coisas por conta própria, sem confiar em nenhuma checagem
// anterior (nem no `proxy.ts`, que só confere presença de cookie — ver
// apps/console/lib/auth/session.ts). Mesmo estilo de
// apps/console/app/(staff)/reservas/nova/actions.ts.
//
// IMPORTANTE: esta é a Server Action REAL, contra o banco via `withTenant` — ao contrário da UI da
// page (./page.tsx, ./ApprovalQueueTable.tsx), que renderiza dados de AMOSTRA estática por não
// haver Postgres vivo nesta máquina (./sample-data.ts explica o porquê). Chamar esta ação a partir
// da amostra tenta o Postgres real e, sem Docker rodando, falha com erro de conexão — esperado
// nesta fase, não um bug desta Server Action.
import { and, eq } from "drizzle-orm";
import { ApprovalDecisionSchema } from "@titan/contracts";
import {
  rejectApproval,
  transitionApproval,
  type ApprovalImpact,
  type ApprovalRequest,
  type ApprovalRisk,
  type ApprovalStatus,
  type ApprovalType,
} from "@titan/domain";
import { approvalRequests, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Erros de sessão/tenant e de domínio (`RejectionRequiresCommentError`, `InvalidTransitionError`,
 * ou qualquer `Error` de validação) já chegam com mensagem pronta para exibição — nunca deixamos
 * uma exceção não tratada vazar para o cliente (o cliente só vê `ActionResult`). Mesmo padrão de
 * apps/console/app/(staff)/reservas/nova/actions.ts. */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

/** Converte a linha crua do Drizzle (`packages/db/src/schema/approval-request.ts`) para o
 * agregado de domínio `ApprovalRequest` (`packages/domain/src/approval/approval-request.ts`) —
 * mesmo padrão de conversão de `toDomainRatePlan` em reservas/nova/actions.ts. `type`/`risk` são
 * `text` no banco (seção 9.4.2 não tem CHECK de `type` — ver comentário na migration 0003), o
 * cast aqui segue a mesma convenção já usada para `status` em reservas/nova/actions.ts. */
function toDomainApprovalRequest(row: typeof approvalRequests.$inferSelect): ApprovalRequest {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type as ApprovalType,
    requestedBy: row.requestedBy,
    rationale: row.rationale,
    impact: row.impact as ApprovalImpact,
    risk: row.risk as ApprovalRisk,
    requiredApprovals: row.requiredApprovals as 1 | 2,
    stepUpRequired: row.stepUpRequired,
    slaAtEpochMs: row.slaAt.getTime(),
    status: row.status as ApprovalStatus,
  };
}

type DecisionOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "decided"; status: ApprovalStatus };

export async function decideApprovalAction(input: unknown): Promise<ActionResult<{ status: ApprovalStatus }>> {
  const parsed = ApprovalDecisionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const decision = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  // "approve" cobre AMBAS as decisões possíveis sobre a fila (aprovar e rejeitar) — ver comentário
  // em packages/auth/src/abilities.ts sobre por que não existe uma ability "reject" separada.
  if (session.ability.cannot("approve", "approval_request")) {
    return { ok: false, error: "Sem permissão para decidir sobre a fila de aprovações com o papel atual." };
  }

  try {
    const outcome = await withTenant<DecisionOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [row] = await db
          .select()
          .from(approvalRequests)
          .where(
            and(eq(approvalRequests.id, decision.approvalRequestId), eq(approvalRequests.status, "pending")),
          );

        if (!row) {
          return {
            kind: "business-error",
            error: "Solicitação de aprovação não encontrada ou já decidida por outra pessoa.",
          };
        }

        const domainRequest = toDomainApprovalRequest(row);

        // `rejectApproval` LANÇA `RejectionRequiresCommentError` (packages/domain/src/approval/
        // approval-state-machine.ts) se `comment` vier vazio — o Zod (`ApprovalDecisionSchema`)
        // já barra isso antes de chegar aqui, mas o domínio continua sendo a garantia estrutural:
        // se escapar por qualquer caminho futuro, a exceção sobe intacta até o catch externo
        // desta função, que já sabe extrair `.message` de qualquer `Error` (mensagem em pt-BR,
        // pronta para exibição — ver `RejectionRequiresCommentError`).
        const nextStatus =
          decision.decision === "reject"
            ? rejectApproval(domainRequest, decision.comment ?? "").status
            : transitionApproval(domainRequest.status, "approved");

        // TODO(Fase 2, Passo 6 do plano — pendente de integração, NÃO implementado aqui): para
        // `type === "refund"`, aprovar deveria disparar a EXECUÇÃO real do reembolso — chamar o
        // adapter de gateway correspondente (`packages/payments`, faixa paralela em construção
        // agora) e postar o lançamento de estorno no ledger (`entriesForRefund` + `postDoubleEntry`
        // de `@titan/domain`, packages/domain/src/ledger/posting-rules.ts e post-double-entry.ts).
        // Essas peças podem não estar prontas nesta sessão (2 faixas paralelas mexendo em
        // packages/payments agora) — invocá-las aqui seria inventar uma integração que não existe.
        // Por isso: só transicionamos o status da fila para "approved"/"rejected" e registramos a
        // decisão (decidedBy/decidedAt/decisionComment) abaixo; a execução financeira real do
        // reembolso fica marcada como pendente de integração, para o Passo 6 explicitamente ligar
        // quando o adapter de gateway estiver pronto — nunca decidida silenciosamente por esta
        // Server Action sozinha (anti-padrão #14: consequência financeira decidida por IA/automação
        // sem confirmação humana explicita neste ponto de integração).
        //
        // Nota adicional: `requiredApprovals === 2` (dupla aprovação) também não tem fluxo de
        // "segunda assinatura" implementado nesta passada — uma única decisão já transiciona a
        // solicitação para o estado terminal. Ficará documentado como dívida técnica até a Fase 5
        // (Financeiro) desenhar o fluxo de dupla aprovação de verdade.

        await db
          .update(approvalRequests)
          .set({
            status: nextStatus,
            decisionComment: decision.comment ?? null,
            decidedBy: session.userId,
            decidedAt: new Date(),
          })
          .where(eq(approvalRequests.id, row.id));

        return { kind: "decided", status: nextStatus };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: outcome.status } };
  } catch (err) {
    return toActionError(err, "Falha ao decidir solicitação de aprovação.");
  }
}
