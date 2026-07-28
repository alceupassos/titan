"use server";

// Server Actions do cockpit de distribuição (Fase 3, Passo 4d — docs/fase-atual.md, seção 9.2 do
// prompt único: painel "Saúde da Distribuição" com correção assistida de divergência, DLQ com
// reprocesso, kill switch por canal — ADR-0020). Regra dura do CLAUDE.md raiz: "Toda Server
// Action valida (Zod) e autoriza (CASL) dentro dela mesma" — as três ações abaixo fazem as duas
// coisas por conta própria, sem confiar em nenhuma checagem anterior (nem no `proxy.ts`). Mesmo
// estilo de apps/console/app/(staff)/aprovacoes/actions.ts e
// apps/console/app/(staff)/reservas/nova/actions.ts — leia os dois antes de mexer aqui.
//
// IMPORTANTE: estas são as Server Actions REAIS, contra o banco via `withTenant` — ao contrário da
// UI da page (./page.tsx e os client components desta pasta), que renderiza dados de AMOSTRA
// estática por não haver Postgres vivo nesta máquina (./sample-data.ts explica o porquê). Chamar
// qualquer uma destas ações a partir da amostra tenta o Postgres real e, sem Docker rodando,
// falha com erro de conexão — esperado nesta fase, não um bug desta Server Action.
//
// LIMITAÇÃO DE INTEGRAÇÃO ENTRE PROCESSOS (documentada em cada função, não escondida): o worker
// (`apps/worker`) e os adapters de canal (`packages/channels`) são faixas paralelas AINDA em
// construção nesta mesma fase, em processos/pacotes que esta faixa (4d, escopo só
// `apps/console/*`) não pode importar nem tocar. Uma Server Action do Next não deveria de todo
// jeito importar direto uma fila/worker de outro processo — a integração real (chamada HTTP para
// um endpoint do worker, ou o worker consumindo uma marca gravada no banco) é decisão de outra
// faixa. Por isso cada ação abaixo faz só a parte que É responsabilidade do cockpit (validar,
// autorizar, gravar a intenção/decisão no banco) e documenta explicitamente, como TODO, o que
// falta para a execução de fato do lado do canal.
import { and, eq } from "drizzle-orm";
import {
  ResolveDivergenceSchema,
  RetrySyncSchema,
  ToggleChannelAdapterSchema,
} from "@titan/contracts";
import { channelSyncLog, divergences, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mesmo padrão de apps/console/app/(staff)/aprovacoes/actions.ts: erros de sessão/tenant e
 * qualquer `Error` de validação/domínio já chegam com mensagem pronta para exibição — nunca
 * deixamos uma exceção não tratada vazar para o cliente (o cliente só vê `ActionResult`). */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

type ResolveOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "resolved" };

/**
 * Resolve uma divergência aberta (`packages/domain/src/channel/divergence.ts` documenta o
 * VOCABULÁRIO de divergência, mas é zero I/O — não tem função `resolveDivergence`, então esta
 * Server Action opera direto sobre a linha do Drizzle, mesmo estilo do restante desta pasta).
 *
 * O que esta ação FAZ de verdade: marca a divergência como `resolved` no banco (`status`,
 * `resolvedAt`), e anexa a decisão (`resolution`, `note`, `resolvedBy`) dentro de `detail` — não
 * existe coluna própria para isso em `divergences` (packages/db/src/schema/divergence.ts, fora do
 * escopo desta faixa: só `packages/channels`/`apps/worker` mexem lá, e mesmo essas duas faixas
 * paralelas não tocam `packages/db`), então o registro fica dentro do jsonb existente em vez de
 * inventar uma migration.
 *
 * O que esta ação NÃO FAZ (TODO explícito, pendente de integração — mesmo padrão já usado no
 * Passo 4d da Fase 2 para reembolso): a EXECUÇÃO real de "aceitar remoto" (sobrescrever o dado
 * local com o que o canal reporta) ou "aceitar local" (reenviar/push o dado local para o canal) é
 * responsabilidade do adapter de canal (`packages/channels`, faixas paralelas ainda em
 * construção). Invocar isso aqui seria inventar uma integração que não existe — por isso a
 * divergência só é marcada como resolvida no banco; a correção de fato do lado do canal fica
 * pendente até o adapter correspondente expor uma função para chamar.
 */
export async function resolveDivergenceAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = ResolveDivergenceSchema.safeParse(input);
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

  if (session.ability.cannot("update", "channel_sync")) {
    return { ok: false, error: "Sem permissão para resolver divergências de canal com o papel atual." };
  }

  try {
    const outcome = await withTenant<ResolveOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [row] = await db
          .select()
          .from(divergences)
          .where(and(eq(divergences.id, decision.divergenceId), eq(divergences.status, "open")));

        if (!row) {
          return {
            kind: "business-error",
            error: "Divergência não encontrada ou já resolvida por outra pessoa.",
          };
        }

        // TODO(Fase 3+ — pendente de integração com packages/channels/apps/worker, NÃO
        // implementado aqui): disparar o push/pull real correspondente à resolução escolhida.
        // Ver comentário do cabeçalho desta função.
        const existingDetail = (row.detail ?? {}) as Record<string, unknown>;

        await db
          .update(divergences)
          .set({
            status: "resolved",
            resolvedAt: new Date(),
            detail: {
              ...existingDetail,
              resolution: decision.resolution,
              note: decision.note ?? null,
              resolvedBy: session.userId,
            },
          })
          .where(eq(divergences.id, row.id));

        return { kind: "resolved" };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: "resolved" } };
  } catch (err) {
    return toActionError(err, "Falha ao resolver divergência.");
  }
}

type RetryOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "requested" };

/**
 * Reenfileira manualmente um item da DLQ (seção 9.2 do prompt único: "DLQ com reprocesso pelo
 * cockpit").
 *
 * DECISÃO DE DESIGN sobre a lacuna de integração entre processos: reprocessar de verdade depende
 * do worker (`apps/worker`, faixa paralela, roda em processo separado) estar acessível daqui — e
 * uma Server Action do Next NÃO deveria importar direto uma fila BullMQ de outro processo. Como
 * não há infra viva nesta máquina para validar uma chamada HTTP real contra o worker, a forma
 * escolhida aqui é: gravar um NOVO registro em `channel_sync_log` com `status: "retry_requested"`
 * (valor novo, informal — a coluna é `text` sem CHECK constraint, mesmo padrão de "aberto"/
 * "resolvido" em `divergences.status`) referenciando o log de erro original em `detail`. Quando o
 * worker estiver de pé, ele passa a poder consultar `channel_sync_log` por `status =
 * 'retry_requested'` e tratar isso como um pedido de reprocesso — mas essa leitura do lado do
 * worker está FORA do escopo desta faixa (não se toca `apps/worker`). Nenhuma fila real é
 * chamada aqui.
 */
export async function retrySyncAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = RetrySyncSchema.safeParse(input);
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

  if (session.ability.cannot("update", "channel_sync")) {
    return { ok: false, error: "Sem permissão para reprocessar item da DLQ com o papel atual." };
  }

  try {
    const outcome = await withTenant<RetryOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [row] = await db
          .select()
          .from(channelSyncLog)
          .where(and(eq(channelSyncLog.id, request.channelSyncLogId), eq(channelSyncLog.status, "error")));

        if (!row) {
          return {
            kind: "business-error",
            error: "Item da DLQ não encontrado ou já não está mais em estado de erro.",
          };
        }

        // Ver DECISÃO DE DESIGN no cabeçalho desta função: isto só GRAVA a intenção de
        // reprocesso — nenhuma fila/worker é chamado de fato a partir daqui.
        await db.insert(channelSyncLog).values({
          tenantId: session.tenantId,
          channel: row.channel,
          unitId: row.unitId,
          direction: row.direction,
          status: "retry_requested",
          detail: {
            retryOfChannelSyncLogId: row.id,
            requestedBy: session.userId,
            requestedAt: new Date().toISOString(),
          },
        });

        return { kind: "requested" };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: "retry_requested" } };
  } catch (err) {
    return toActionError(err, "Falha ao solicitar reprocesso.");
  }
}

/**
 * Kill switch manual por canal (ADR-0020 — mitigação de risco EXIGIDA para o adapter de
 * automação via navegador do Airbnb: "o cockpit tem um controle explícito para desligar a
 * automação desse canal especificamente, sem precisar de deploy").
 *
 * HONESTIDADE SOBRE A LACUNA (em vez de fingir que desliga algo): desabilitar um adapter de
 * verdade precisa de um lugar para PERSISTIR esse estado que `apps/worker`/`packages/channels`
 * leiam antes de cada sincronização — ou seja, uma tabela tipo `channel_adapter_config`. Essa
 * tabela NÃO existe em `packages/db` (schema está fora do escopo desta faixa — só
 * `apps/console/*` e este trecho de `packages/auth`). Sem ela, não há ONDE gravar
 * `enabled: false` de um jeito que o worker realmente veja. Por isso esta ação valida e autoriza
 * normalmente (a checagem de permissão é real), mas devolve um erro claro em vez de simular
 * sucesso — nunca finge que desligou o adapter. Ver dívida técnica desta função registrada em
 * docs/fase-atual.md quando esta sessão for encerrada.
 */
export async function toggleChannelAdapterAction(input: unknown): Promise<ActionResult<never>> {
  const parsed = ToggleChannelAdapterSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((issue) => issue.message).join("; ") };
  }

  let session;
  try {
    session = await requireStaffSession();
  } catch (err) {
    return toActionError(err, "Falha ao verificar sessão.");
  }

  if (session.ability.cannot("approve", "channel_sync")) {
    return { ok: false, error: "Sem permissão para acionar o kill switch de canal com o papel atual." };
  }

  // Validação e autorização acima são reais. A partir daqui, honestidade em vez de execução
  // fingida — ver o comentário da função.
  return {
    ok: false,
    error:
      "Kill switch ainda não persistido — ver dívida técnica da Fase 3 (falta tabela " +
      "channel_adapter_config em packages/db para o worker/adapter consultarem antes de cada " +
      "sincronização). Esta ação valida permissão, mas não desliga nada de verdade ainda.",
  };
}
