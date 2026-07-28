"use server";

// Server Action do console de automação (Fase 10, Passo 4b — docs/fase-atual.md). Regra dura do
// CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza (CASL) dentro dela mesma" — mesmo
// estilo de apps/console/app/(staff)/pricing/actions.ts (leia antes de mexer aqui), incluindo o
// padrão de UPSERT (`onConflictDoUpdate`) já usado ali para `pricing_autonomy_configs`.
//
// IMPORTANTE: é uma Server Action REAL, contra o banco via `withTenant` — ao contrário da UI da
// page (./page.tsx), que renderiza dados de AMOSTRA estática (./sample-data.ts) por não haver
// Postgres vivo nesta máquina (Gap conhecido 2, docs/fase-atual.md). Chamar esta ação a partir da
// amostra tenta o Postgres real e, sem Docker rodando, falha com erro de conexão — esperado.
import { eq } from "drizzle-orm";
import { RunConciergeConversationSchema, ToggleAgentKillSwitchSchema } from "@titan/contracts";
import { agentConversations, agentKillSwitches, agentTraces, withTenant } from "@titan/db";
import {
  assertNoWriteToolForUntrustedContent,
  computeConversationCostCents,
  RuleBasedModelProvider,
  WRITE_TOOL_NAMES,
  WriteToolBlockedByUntrustedContentError,
  type AgentMessage,
  type ModelPriceRule,
} from "@titan/agents";
import type { Cents } from "@titan/domain";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

export async function toggleAgentKillSwitchAction(
  input: unknown,
): Promise<ActionResult<{ agentName: string; enabled: boolean }>> {
  const parsed = ToggleAgentKillSwitchSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("update", "agent_kill_switch")) {
    return { ok: false, error: "Sem permissão para ligar/desligar agente com o papel atual." };
  }

  try {
    await withTenant({ tenantId: session.tenantId, actorId: session.userId }, async (db) => {
      await db
        .insert(agentKillSwitches)
        .values({
          tenantId: session.tenantId,
          agentName: request.agentName,
          enabled: request.enabled,
        })
        .onConflictDoUpdate({
          target: agentKillSwitches.agentName,
          set: {
            enabled: request.enabled,
            updatedAt: new Date(),
          },
        });
    });
    return { ok: true, data: { agentName: request.agentName, enabled: request.enabled } };
  } catch (err) {
    return toActionError(err, "Falha ao atualizar kill switch do agente.");
  }
}

const CONCIERGE_AGENT_NAME = "concierge";
const CONCIERGE_AGENT_VERSION = "v0.1";

// Preço de exemplo do "modelo" (RuleBasedModelProvider) — pendente de confirmação antes de
// produção real, mesma ressalva já usada para toda tabela de preço/alíquota desde a Fase 4 (sem
// provedor de LLM real configurado nesta sessão). packages/agents/src/cost.ts nunca aceita
// preço zero silencioso — por isso um valor de exemplo explícito aqui, não uma omissão.
const RULE_BASED_PRICE: ModelPriceRule = {
  modelName: "rule-based-v1",
  promptRateBasisPointsPerThousandTokens: 150,
  completionRateBasisPointsPerThousandTokens: 600,
};

class AgentDisabledError extends Error {
  constructor(agentName: string) {
    super(`Agente "${agentName}" está desligado (kill switch) — nenhuma conversa nova é aceita.`);
    this.name = "AgentDisabledError";
  }
}

type ConversationOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "responded"; conversationId: string; responseText: string; costCents: Cents };

/**
 * Orquestra uma conversa do Concierge (Fase 10, Passo 5 — docs/fase-atual.md): checa o kill
 * switch ANTES de responder (guardrail #10, ADR-0009), roda `RuleBasedModelProvider` (redução de
 * escopo — sem LLM real nesta sessão), aplica o guardrail #1 (`assertNoWriteToolForUntrustedContent`)
 * antes de aceitar qualquer ferramenta que o modelo peça, grava `agent_conversations`+
 * `agent_traces` na MESMA transação. Nunca executa a ferramenta pedida de verdade — isso é
 * responsabilidade do titan-mcp-prod (apps/mcp), fora desta Server Action; aqui só se prova que o
 * guardrail bloquearia/permitiria a chamada, e o trace registra a intenção.
 */
export async function runConciergeConversationAction(
  input: unknown,
): Promise<ActionResult<{ conversationId: string; responseText: string; costCents: Cents }>> {
  const parsed = RunConciergeConversationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }
  const request = parsed.data;

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("create", "agent_conversation")) {
    return { ok: false, error: "Sem permissão para rodar conversa de agente com o papel atual." };
  }

  try {
    const outcome = await withTenant<ConversationOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [killSwitchRow] = await db
          .select()
          .from(agentKillSwitches)
          .where(eq(agentKillSwitches.agentName, CONCIERGE_AGENT_NAME));
        if (killSwitchRow && !killSwitchRow.enabled) {
          throw new AgentDisabledError(CONCIERGE_AGENT_NAME);
        }

        const [conversationRow] = await db
          .insert(agentConversations)
          .values({
            tenantId: session.tenantId,
            agentName: CONCIERGE_AGENT_NAME,
            agentVersion: CONCIERGE_AGENT_VERSION,
            plane: "platform",
          })
          .returning({ id: agentConversations.id });
        if (!conversationRow) {
          throw new Error("INSERT de agent_conversation não retornou id.");
        }

        const messages: AgentMessage[] = [
          { role: "user", content: request.userMessage, trusted: request.trusted },
        ];
        const provider = new RuleBasedModelProvider();
        const completion = await provider.complete(messages);

        // Guardrail #1 — nunca depende do modelo "se recusar sozinho". Se a ferramenta pedida for
        // de escrita e a conversa tiver conteúdo não confiável, o guardrail bloqueia aqui, antes
        // de qualquer trace de ferramenta ser gravado como "executada".
        let toolBlockedReason: string | null = null;
        if (completion.requestedTool) {
          try {
            assertNoWriteToolForUntrustedContent(messages, completion.requestedTool, WRITE_TOOL_NAMES);
          } catch (err) {
            if (err instanceof WriteToolBlockedByUntrustedContentError) {
              toolBlockedReason = err.message;
            } else {
              throw err;
            }
          }
        }

        const costCents = computeConversationCostCents(completion.usage, RULE_BASED_PRICE);

        await db.insert(agentTraces).values([
          {
            tenantId: session.tenantId,
            conversationId: conversationRow.id,
            role: "user",
            contentRedacted: request.userMessage,
            costCents: 0,
            latencyMs: 0,
          },
          {
            tenantId: session.tenantId,
            conversationId: conversationRow.id,
            role: "agent",
            contentRedacted: toolBlockedReason ?? completion.responseText,
            toolName: toolBlockedReason ? null : completion.requestedTool,
            tokenUsage: completion.usage,
            costCents,
            latencyMs: 0,
          },
        ]);

        return {
          kind: "responded",
          conversationId: conversationRow.id,
          responseText: toolBlockedReason ?? completion.responseText,
          costCents,
        };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return {
      ok: true,
      data: {
        conversationId: outcome.conversationId,
        responseText: outcome.responseText,
        costCents: outcome.costCents,
      },
    };
  } catch (err) {
    return toActionError(err, "Falha ao rodar conversa do Concierge.");
  }
}
