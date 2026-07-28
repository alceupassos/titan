"use server";

// Server Actions do cockpit fiscal (Fase 4, Passo 4c — docs/fase-atual.md; I7: documento fiscal
// emitido não é editável, só cancelado/substituído). Regra dura do CLAUDE.md raiz: "Toda Server
// Action valida (Zod) e autoriza (CASL) dentro dela mesma" — as duas ações abaixo fazem as duas
// coisas por conta própria, sem confiar em nenhuma checagem anterior (nem no `proxy.ts`). Mesmo
// estilo de apps/console/app/(staff)/distribuicao/actions.ts e
// apps/console/app/(staff)/aprovacoes/actions.ts — leia os dois antes de mexer aqui.
//
// IMPORTANTE: estas são as Server Actions REAIS, contra o banco via `withTenant` — ao contrário da
// UI da page (./page.tsx, ./FiscalDocumentList.tsx), que renderiza dados de AMOSTRA estática por
// não haver Postgres vivo nesta máquina (./sample-data.ts explica o porquê). Chamar qualquer uma
// destas ações a partir da amostra tenta o Postgres real e, sem Docker rodando, falha com erro de
// conexão — esperado nesta fase, não um bug desta Server Action.
//
// LIMITAÇÃO DE INTEGRAÇÃO ENTRE PROCESSOS (documentada aqui, não escondida — mesma classe de
// lacuna já registrada em apps/console/app/(staff)/distribuicao/actions.ts::retrySyncAction): o
// envio de verdade ao provedor fiscal (Focus NFe) roda em `packages/fiscal`, consumido por
// `apps/worker` — ambos faixas paralelas nesta mesma fase, em processos/pacotes que esta faixa
// (4c, escopo só `apps/console/*` e o trecho indicado de `packages/auth`) não pode importar nem
// tocar. Uma Server Action do Next não deveria de todo jeito chamar direto um gateway fiscal de
// outro processo — por isso cada ação abaixo faz só a parte que É responsabilidade do cockpit
// (validar, autorizar, gravar a intenção/decisão no banco + trilha de auditoria) e documenta
// explicitamente, como TODO, o que falta para a execução de fato do lado do provedor.
import { and, eq } from "drizzle-orm";
import { CancelInvoiceSchema, RetryInvoiceIssuanceSchema } from "@titan/contracts";
import { auditLog, fiscalDocuments, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mesmo padrão de apps/console/app/(staff)/distribuicao/actions.ts: erros de sessão/tenant e
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

type RetryOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "retry-requested" };

/**
 * Reprocessa a emissão de uma nota `pending`/`rejected` (seção 9.6 do prompt único).
 *
 * DECISÃO DE DESIGN sobre a lacuna de integração entre processos (mesma classe de decisão já
 * tomada em apps/console/app/(staff)/distribuicao/actions.ts::retrySyncAction, adaptada porque
 * `fiscal_documents` NÃO é uma tabela de log como `channel_sync_log` — tem `natural_key UNIQUE`
 * por linha (uma linha por fato gerador, nunca múltiplas por tentativa), então inserir uma NOVA
 * linha para marcar o pedido de reprocesso, como `retrySyncAction` faz, violaria essa constraint
 * e duplicaria o documento. Por isso o marcador aqui é a própria coluna `status` da linha
 * existente (também `text` sem CHECK constraint, mesmo espírito informal de "retry_requested" já
 * usado em `channel_sync_log.status`): a linha muda de `pending`/`rejected` para
 * `retry_requested`. Quando o worker (`apps/worker`/`packages/fiscal`) estiver de pé, ele passa a
 * poder consultar `fiscal_documents` por `status = 'retry_requested'` e tratar isso como um
 * pedido de nova tentativa — mas essa leitura do lado do worker está FORA do escopo desta faixa.
 * Nenhuma chamada ao provedor (Focus NFe) é feita aqui.
 *
 * `fiscal_documents` não tem coluna jsonb própria para registrar quem/quando pediu o reprocesso
 * (schema fora do escopo desta faixa) — por isso a trilha de auditoria (quem, quando, status
 * anterior) vai para `audit_log` (append-only, packages/db/src/schema/audit-log.ts — seção 5.3 do
 * prompt único), não para a linha do documento.
 */
export async function retryInvoiceIssuanceAction(
  input: unknown,
): Promise<ActionResult<{ status: string }>> {
  const parsed = RetryInvoiceIssuanceSchema.safeParse(input);
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

  // "update" já é concedido a titan.finance junto de "ledger" desde antes deste passo — ver
  // comentário em packages/auth/src/abilities.ts sobre por que reprocessar não precisou de
  // ability nova.
  if (session.ability.cannot("update", "fiscal_document")) {
    return { ok: false, error: "Sem permissão para reprocessar emissão de nota com o papel atual." };
  }

  try {
    const outcome = await withTenant<RetryOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        // Filtro de status (`pending`/`rejected`) é checado em memória após o SELECT em vez de
        // `inArray` no WHERE — mesmo estilo direto de retrySyncAction/resolveDivergenceAction
        // (comparação simples), só que aqui são 2 valores possíveis em vez de 1.
        const [row] = await db.select().from(fiscalDocuments).where(eq(fiscalDocuments.id, request.fiscalDocumentId));

        if (!row || (row.status !== "pending" && row.status !== "rejected")) {
          return {
            kind: "business-error",
            error: "Documento fiscal não encontrado ou não está em estado pendente/rejeitado.",
          };
        }

        // Ver DECISÃO DE DESIGN no cabeçalho desta função: isto só GRAVA a intenção de
        // reprocesso — nenhuma chamada ao provedor é feita de fato a partir daqui.
        await db
          .update(fiscalDocuments)
          .set({ status: "retry_requested" })
          .where(eq(fiscalDocuments.id, row.id));

        await db.insert(auditLog).values({
          tenantId: session.tenantId,
          actorType: "user",
          actorId: session.userId,
          action: "fiscal_document.retry_requested",
          diff: { fiscalDocumentId: row.id, previousStatus: row.status, nextStatus: "retry_requested" },
        });

        return { kind: "retry-requested" };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: "retry_requested" } };
  } catch (err) {
    return toActionError(err, "Falha ao solicitar reprocesso da emissão.");
  }
}

type CancelOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "cancelled" };

/**
 * Cancela uma nota já `issued` (I7 — nunca edição, só cancelamento/substituição).
 *
 * O QUE ESTA AÇÃO FAZ DE VERDADE: marca `status = "cancelled"` em `fiscal_documents` de imediato
 * — ao contrário do reprocesso (que depende do provedor externo), o cancelamento LOCAL é uma
 * mudança de status que o cockpit pode fazer diretamente, sem esperar nenhum outro processo,
 * porque é a Titan decidindo que aquele documento não vale mais para fins de controle interno.
 *
 * O QUE ESTA AÇÃO NÃO FAZ (TODO explícito, pendente de integração — mesma dualidade "banco
 * atualizado localmente, execução externa pendente" já documentada em
 * distribuicao/actions.ts::resolveDivergenceAction): o cancelamento de verdade JUNTO AO PROVEDOR
 * fiscal (chamar `FiscalGateway.cancel()`, dentro do prazo municipal — seção 9.6) depende do
 * worker (`apps/worker`/`packages/fiscal`, faixas paralelas) consumir esta decisão depois. Esta
 * Server Action não chama nenhum gateway — inventar essa chamada aqui seria construir uma
 * integração que não existe.
 *
 * O motivo do cancelamento (`reason`, Zod exige não-vazio — mesmo padrão de "rejeição exige
 * comentário" da fila de aprovações) vai para `audit_log.diff`, NUNCA para
 * `fiscal_documents.rejection_reason` — essa coluna é semanticamente o motivo de o PROVEDOR ter
 * recusado uma emissão (um conceito diferente), reaproveitá-la para "motivo de cancelamento"
 * confundiria as duas histórias na mesma linha.
 */
export async function cancelInvoiceAction(input: unknown): Promise<ActionResult<{ status: string }>> {
  const parsed = CancelInvoiceSchema.safeParse(input);
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

  // "approve" é o verbo novo adicionado a titan.finance nesta faixa (packages/auth/src/
  // abilities.ts) — cancelar uma nota emitida é decisão mais consequente que um "update" comum.
  if (session.ability.cannot("approve", "fiscal_document")) {
    return { ok: false, error: "Sem permissão para cancelar nota fiscal com o papel atual." };
  }

  try {
    const outcome = await withTenant<CancelOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [row] = await db
          .select()
          .from(fiscalDocuments)
          .where(and(eq(fiscalDocuments.id, request.fiscalDocumentId), eq(fiscalDocuments.status, "issued")));

        if (!row) {
          return {
            kind: "business-error",
            error: "Documento fiscal não encontrado ou não está em estado emitido.",
          };
        }

        await db
          .update(fiscalDocuments)
          .set({ status: "cancelled" })
          .where(eq(fiscalDocuments.id, row.id));

        await db.insert(auditLog).values({
          tenantId: session.tenantId,
          actorType: "user",
          actorId: session.userId,
          action: "fiscal_document.cancelled",
          diff: {
            fiscalDocumentId: row.id,
            previousStatus: row.status,
            nextStatus: "cancelled",
            reason: request.reason,
          },
        });

        // TODO(Fase 4+ — pendente de integração com packages/fiscal/apps/worker, NÃO implementado
        // aqui): disparar `FiscalGateway.cancel()` junto ao provedor. Ver comentário do cabeçalho
        // desta função.

        return { kind: "cancelled" };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: "cancelled" } };
  } catch (err) {
    return toActionError(err, "Falha ao cancelar nota fiscal.");
  }
}
