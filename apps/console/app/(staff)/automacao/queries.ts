// Caminho de LEITURA real do console de automação (Fase 10, Passo 4b — docs/fase-atual.md) —
// mesmo padrão "pronto mas não exercitado contra Postgres vivo" já usado em
// apps/console/app/(staff)/pricing/queries.ts e .../estoque/queries.ts (Gap conhecido 2: Docker
// Desktop sem daemon nesta máquina). Nenhuma função abaixo é chamada por ./page.tsx nesta fase —
// a página renderiza sobre AMOSTRA estática (./sample-data.ts); trocar a fonte por estas funções é
// a única mudança necessária quando o Postgres estiver de pé, nunca a lógica de ./page.tsx.
import { and, desc, eq, gte } from "drizzle-orm";
import {
  agentConversations,
  agentKillSwitches,
  agentTraces,
  approvalRequests,
  goldenSetRuns,
  withTenant,
} from "@titan/db";
import { requireStaffSession } from "@/lib/auth/session";

/** Início do dia corrente em UTC — mesmo espírito de "hoje" usado no resto do cockpit (sem
 * `@titan/dates`/`CivilDate` aqui porque `agent_conversations.started_at` é timestamp, não data
 * civil de estadia — I/O de conversa de agente não é o domínio que I9/datas civis protege). */
function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getAgentConversationsToday() {
  const session = await requireStaffSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db
      .select()
      .from(agentConversations)
      .where(gte(agentConversations.startedAt, startOfTodayUtc()))
      .orderBy(desc(agentConversations.startedAt)),
  );
}

export async function getAgentTracesForConversation(conversationId: string) {
  const session = await requireStaffSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db
      .select()
      .from(agentTraces)
      .where(eq(agentTraces.conversationId, conversationId))
      .orderBy(agentTraces.createdAt),
  );
}

/** Última execução do golden-set para um agente — `goldenSetRuns` é append-only (nunca sobrescrita,
 * ver comentário do schema), então "mais recente" é sempre `orderBy(desc(createdAt)).limit(1)`,
 * nunca um `UPDATE` de uma linha "corrente". */
export async function getLatestGoldenSetRun(agentName: string) {
  const session = await requireStaffSession();
  const rows = await withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db
      .select()
      .from(goldenSetRuns)
      .where(eq(goldenSetRuns.agentName, agentName))
      .orderBy(desc(goldenSetRuns.createdAt))
      .limit(1),
  );
  return rows[0];
}

export async function getAgentKillSwitches() {
  const session = await requireStaffSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db.select().from(agentKillSwitches).orderBy(agentKillSwitches.agentName),
  );
}

/** Resumo da fila de aprovações filtrado por `type='agent_action'` — NUNCA uma segunda
 * implementação da fila real (apps/console/app/(staff)/aprovacoes): esta função só filtra o mesmo
 * `approval_requests` para o KPI/lista resumida do console de automação. Decidir sobre uma linha
 * continua exclusivamente em .../aprovacoes/actions.ts::decideApprovalAction. */
export async function getPendingAgentActionApprovals() {
  const session = await requireStaffSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db
      .select()
      .from(approvalRequests)
      .where(and(eq(approvalRequests.type, "agent_action"), eq(approvalRequests.status, "pending")))
      .orderBy(approvalRequests.slaAt),
  );
}
