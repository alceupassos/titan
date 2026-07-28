// Operações tenant-scoped da emissão fiscal — TODAS via `withTenant()`, mesmo padrão de
// `payment-repo.ts` (Fase 2) e `channel-sync-repo.ts` (Fase 3): extraídas como interface própria
// (`FiscalRepo`) para `jobs/issue-fiscal-document.ts` poder ser testado com um fake em memória,
// sem simular o query builder do drizzle.
import { and, eq } from "drizzle-orm";
import { fiscalDocuments, taxRules, withTenant, type TenantContext } from "@titan/db";
import { resolveTaxRuleForDate, type Cents, type IssuedInvoice, type TaxRule } from "@titan/domain";
import { civilDate, type CivilDate } from "@titan/dates";

export interface FindActiveTaxRuleParams {
  readonly municipalityCode: string;
  readonly serviceCode: string;
  readonly dateISO: string;
}

export interface InsertFiscalDocumentInput {
  readonly reservationId: string;
  readonly naturalKey: string;
  readonly municipalityCode: string;
  readonly serviceCode: string;
  readonly baseAmountCents: Cents;
  readonly taxAmountCents: Cents;
  readonly currency: string;
}

export type InsertFiscalDocumentResult =
  | { readonly kind: "created"; readonly id: string }
  | { readonly kind: "already_exists"; readonly id: string; readonly status: string };

export interface FiscalRepo {
  /**
   * Busca as `tax_rules` do tenant para município+serviço e resolve a vigente para `dateISO` via
   * `resolveTaxRuleForDate` (`@titan/domain`, zero I/O). Assinatura de retorno é `Promise<TaxRule>`
   * — NÃO `Promise<TaxRule | undefined>` como o rascunho da tarefa sugeria: `resolveTaxRuleForDate`
   * nunca retorna vazio, ela sempre lança (`NoTaxRuleForDateError` se nenhuma regra cobrir a data,
   * `OverlappingTaxRuleValidityError` se mais de uma cobrir) — devolver `undefined` aqui exigiria
   * engolir esse lançamento e reinventar o "nenhuma regra encontrada" como um segundo canal de
   * erro, exatamente o "aplicar alíquota zero silenciosamente" que docs/anti-padroes.md #6 proíbe.
   * `jobs/issue-fiscal-document.ts` deixa os dois erros propagarem sem capturar aqui dentro.
   */
  findActiveTaxRule(ctx: TenantContext, params: FindActiveTaxRuleParams): Promise<TaxRule>;

  /**
   * Âncora de idempotência forte (I6/seção 9.6): `INSERT ... ON CONFLICT (natural_key) DO
   * NOTHING RETURNING id`. Se `returning()` vier vazio, a `natural_key` já existia — busca a
   * linha existente e devolve `already_exists` com o `status` ATUAL, sem nunca chamar o gateway
   * de novo. `jobs/issue-fiscal-document.ts` trata `already_exists` com `status !== "pending"`
   * como idempotência plena (nunca mais chama o gateway); `status === "pending"` é tratado como
   * uma tentativa anterior que não chegou a concluir (falha de rede/timeout/processo morto no
   * meio) — chama o gateway de novo reusando a MESMA linha, nunca cria uma segunda.
   */
  insertFiscalDocumentIfNew(ctx: TenantContext, input: InsertFiscalDocumentInput): Promise<InsertFiscalDocumentResult>;

  /** Grava o resultado de uma emissão bem-sucedida. `xmlStorageRef`/`pdfStorageRef` guardam, por
   * enquanto, as URLs devolvidas pelo próprio provedor (`issued.xmlUrl`/`issued.pdfUrl`) — TODO
   * documentado: o cofre WORM real (`packages/fiscal` — `FiscalVault`, Passo 5 da Fase 4, ainda
   * não existe nesta sessão) é quem deveria persistir o binário e devolver a referência definitiva;
   * até lá, a URL do provedor é a referência provisória, nunca o binário em si nesta tabela. */
  updateFiscalDocumentIssued(ctx: TenantContext, id: string, issued: IssuedInvoice): Promise<void>;

  /** Marca uma linha (por id) como `rejected` — usado tanto para rejeição de NEGÓCIO do provedor
   * (`FiscalGatewayRejectionError`) quanto para o caso de `NoTaxRuleForDateError`/
   * `OverlappingTaxRuleValidityError` quando a linha já existia (dívida de cadastro, não de rede). */
  updateFiscalDocumentRejected(ctx: TenantContext, id: string, reason: string): Promise<void>;

  /**
   * Usado só pelo handler de DLQ (`fiscal-queue.ts::registerFiscalIssuanceDlq`) quando um job
   * esgota todas as tentativas (falha de rede persistente) — marca `rejected` por `naturalKey`
   * (o DLQ handler só tem o payload original, nunca o `id` do documento, que é gerado dentro do
   * job). Filtro `status = 'pending'` de propósito: nunca sobrescreve uma linha que, apesar do
   * esgotamento de tentativas registrado pelo BullMQ, já tenha sido marcada `issued`/`rejected`
   * por uma execução concorrente/anterior — só a que ainda está pendente é tocada.
   */
  markPendingFiscalDocumentRejectedByNaturalKey(ctx: TenantContext, naturalKey: string, reason: string): Promise<void>;
}

export function createDrizzleFiscalRepo(): FiscalRepo {
  return {
    async findActiveTaxRule(ctx, params) {
      return withTenant(ctx, async (db) => {
        const rows = await db
          .select()
          .from(taxRules)
          .where(
            and(
              eq(taxRules.tenantId, ctx.tenantId),
              eq(taxRules.municipalityCode, params.municipalityCode),
              eq(taxRules.serviceCode, params.serviceCode),
            ),
          );

        // `date()` do drizzle (modo default) devolve string "YYYY-MM-DD" — mesmo padrão já usado
        // sem conversão em `channel-sync-repo.ts` para `ratePlans.validFrom`/`validTo`.
        const rules: TaxRule[] = rows.map((row) => ({
          id: row.id,
          tenantId: row.tenantId,
          municipalityCode: row.municipalityCode,
          serviceCode: row.serviceCode,
          aliquotBasisPoints: row.aliquotBasisPoints,
          validFrom: row.validFrom as CivilDate,
          validTo: row.validTo as CivilDate,
        }));

        return resolveTaxRuleForDate(rules, {
          municipalityCode: params.municipalityCode,
          serviceCode: params.serviceCode,
          date: civilDate(params.dateISO),
        });
      });
    },

    async insertFiscalDocumentIfNew(ctx, input) {
      return withTenant(ctx, async (db) => {
        const inserted = await db
          .insert(fiscalDocuments)
          .values({
            tenantId: ctx.tenantId,
            reservationId: input.reservationId,
            naturalKey: input.naturalKey,
            municipalityCode: input.municipalityCode,
            serviceCode: input.serviceCode,
            baseAmountCents: input.baseAmountCents,
            taxAmountCents: input.taxAmountCents,
            currency: input.currency,
            status: "pending",
          })
          .onConflictDoNothing({ target: fiscalDocuments.naturalKey })
          .returning({ id: fiscalDocuments.id });

        if (inserted.length > 0) {
          return { kind: "created", id: inserted[0]!.id };
        }

        const [existing] = await db
          .select({ id: fiscalDocuments.id, status: fiscalDocuments.status })
          .from(fiscalDocuments)
          .where(eq(fiscalDocuments.naturalKey, input.naturalKey));
        if (!existing) {
          // Condição impossível sob a constraint UNIQUE(natural_key): o INSERT só teria devolvido
          // 0 linhas por já existir uma com esta chave — se o SELECT também não encontra nada,
          // algo mudou a tabela entre as duas queries de um jeito que a UNIQUE não deveria
          // permitir. Falha alto e claro em vez de devolver um resultado inventado.
          throw new Error(
            `fiscal_documents: INSERT ON CONFLICT DO NOTHING não retornou linha e o SELECT por ` +
              `natural_key="${input.naturalKey}" também não encontrou nada — condição inesperada ` +
              "sob a constraint UNIQUE(natural_key).",
          );
        }
        return { kind: "already_exists", id: existing.id, status: existing.status };
      });
    },

    async updateFiscalDocumentIssued(ctx, id, issued) {
      await withTenant(ctx, async (db) => {
        await db
          .update(fiscalDocuments)
          .set({
            status: "issued",
            externalInvoiceId: issued.externalInvoiceId,
            issuedAt: new Date(issued.issuedAtEpochMs),
            xmlStorageRef: issued.xmlUrl ?? null,
            pdfStorageRef: issued.pdfUrl ?? null,
          })
          .where(eq(fiscalDocuments.id, id));
      });
    },

    async updateFiscalDocumentRejected(ctx, id, reason) {
      await withTenant(ctx, async (db) => {
        await db.update(fiscalDocuments).set({ status: "rejected", rejectionReason: reason }).where(eq(fiscalDocuments.id, id));
      });
    },

    async markPendingFiscalDocumentRejectedByNaturalKey(ctx, naturalKey, reason) {
      await withTenant(ctx, async (db) => {
        await db
          .update(fiscalDocuments)
          .set({ status: "rejected", rejectionReason: reason })
          .where(and(eq(fiscalDocuments.naturalKey, naturalKey), eq(fiscalDocuments.status, "pending")));
      });
    },
  };
}
