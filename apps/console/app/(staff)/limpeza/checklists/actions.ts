"use server";

// Server Action do editor de checklists versionados (Fase 6, Passo 4c — docs/fase-atual.md,
// seção 9.8.4 do prompt único). Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e
// autoriza (CASL) dentro dela mesma" — a função abaixo faz as duas coisas por conta própria, sem
// confiar em nenhuma checagem anterior (nem no `proxy.ts`). Mesmo estilo de
// apps/console/app/(staff)/fiscal/actions.ts e apps/console/app/(staff)/reservas/nova/actions.ts —
// leia os dois antes de mexer aqui.
//
// SCHEMA ZOD LOCAL (decisão de design desta faixa): `packages/contracts/src/housekeeping.ts` já
// existe (Fase 6, Passo 3), mas cobre só o vocabulário de CAPTURA/REVISÃO de evidência e
// SUBMISSÃO de um checklist já preenchido durante uma virada (`SubmitChecklistSchema`) — nenhum
// schema ali valida a CRIAÇÃO de uma nova VERSÃO de `ChecklistTemplate` (o formulário de
// configuração desta página). Como esta faixa está restrita a `apps/console/app/(staff)/limpeza/*`
// e não pode tocar `packages/contracts` (fora do escopo declarado desta tarefa), o schema de
// validação desse formulário fica local a este arquivo, espelhando o vocabulário de
// `packages/domain/src/housekeeping/checklist.ts` (`ChecklistItemType`, `ServiceType`,
// `ChecklistSection`) sem depender desse pacote em runtime — mesmo espírito de
// `packages/contracts/src/housekeeping.ts` (fonte de validação separada do domínio, sincronizada
// manualmente).
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { checklistTemplates, withTenant } from "@titan/db";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mesmo padrão de apps/console/app/(staff)/fiscal/actions.ts: erros de sessão/tenant e qualquer
 * `Error` de validação/domínio já chegam com mensagem pronta para exibição. */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

// Espelha `ServiceType` de packages/domain/src/housekeeping/checklist.ts — os 10 valores da
// seção 9.8.4. Mantido sincronizado manualmente (mesmo espírito de
// packages/contracts/src/housekeeping.ts, que também não importa @titan/domain em runtime).
export const ServiceTypeSchema = z.enum([
  "limpeza_saida",
  "limpeza_intermediaria",
  "limpeza_profunda",
  "dedetizacao",
  "ar_condicionado",
  "piscina",
  "estofado",
  "jardinagem",
  "manutencao_corretiva",
  "vistoria",
]);
export type ServiceTypeInput = z.infer<typeof ServiceTypeSchema>;

// Espelha `ChecklistItemType` — os 8 tipos de item suportados.
const ChecklistItemTypeSchema = z.enum([
  "photo",
  "confirm",
  "numeric",
  "select",
  "text",
  "scan",
  "timer",
  "signature",
]);

const ChecklistItemSchema = z.object({
  id: z.string().min(1, "Item precisa de um id."),
  label: z.string().min(1, "Item precisa de um rótulo."),
  weight: z.number().nonnegative("Peso nunca é negativo."),
  blocking: z.boolean(),
  type: ChecklistItemTypeSchema,
  expectedSeconds: z.number().positive().optional(),
});

const ChecklistSectionSchema = z.object({
  id: z.string().min(1, "Seção precisa de um id."),
  title: z.string().min(1, "Seção precisa de um título."),
  items: z.array(ChecklistItemSchema).min(1, "Seção precisa de ao menos um item."),
});
export type ChecklistSectionInput = z.infer<typeof ChecklistSectionSchema>;

const CIVIL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const civilDateSchema = z.string().regex(CIVIL_DATE_RE, "Data esperada no formato YYYY-MM-DD.");

export const CreateChecklistTemplateVersionSchema = z
  .object({
    serviceType: ServiceTypeSchema,
    sections: z.array(ChecklistSectionSchema).min(1, "Template precisa de ao menos uma seção."),
    passingScore: z.number().min(0).max(100, "Pontuação de aprovação é 0-100."),
    validFrom: civilDateSchema,
    validTo: civilDateSchema,
  })
  .refine((value) => value.validFrom < value.validTo, {
    message: "validTo precisa ser posterior a validFrom.",
    path: ["validTo"],
  });
export type CreateChecklistTemplateVersion = z.infer<typeof CreateChecklistTemplateVersionSchema>;

type CreateOutcome =
  | { kind: "created"; id: string; version: number }
  | { kind: "business-error"; error: string };

/**
 * Cria uma NOVA VERSÃO de `ChecklistTemplate` para o `serviceType` informado — NUNCA edita uma
 * versão já existente (mesmo princípio de `tax_rules`/`administration_contracts`: o padrão de
 * qualidade de uma virada muda ao longo do tempo, mas uma virada já concluída precisa continuar
 * auditável contra o template exato vigente quando ela foi feita — packages/domain/src/
 * housekeeping/checklist.ts, cabeçalho do arquivo).
 *
 * Versão calculada em memória (busca a maior `version` existente para o mesmo `serviceType` no
 * tenant, +1; ou 1 se não houver nenhuma) — mesmo estilo direto de outras Server Actions desta
 * fase (`retryInvoiceIssuanceAction`) que preferem um SELECT simples seguido de lógica em memória
 * a uma agregação SQL, dado o volume baixo de linhas por serviceType.
 *
 * `validFrom`/`validTo` da nova versão não são checados contra sobreposição de vigência com
 * versões anteriores do mesmo serviceType — ao contrário de `tax_rules`
 * (`resolveTaxRuleForDate`, que lança em ambiguidade), não existe ainda, neste pacote, uma função
 * de domínio equivalente para checklist (fora do escopo desta faixa, que não toca
 * `packages/domain`). Dívida técnica documentada, não escondida.
 */
export async function createChecklistTemplateVersionAction(
  input: unknown,
): Promise<ActionResult<{ id: string; version: number }>> {
  const parsed = CreateChecklistTemplateVersionSchema.safeParse(input);
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

  if (session.ability.cannot("create", "checklist_template")) {
    return { ok: false, error: "Sem permissão para criar versão de checklist com o papel atual." };
  }

  try {
    const outcome = await withTenant<CreateOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const existingRows = await db
          .select({ version: checklistTemplates.version })
          .from(checklistTemplates)
          .where(eq(checklistTemplates.serviceType, request.serviceType))
          .orderBy(desc(checklistTemplates.version));

        const highestVersion = existingRows.reduce((max, row) => Math.max(max, row.version), 0);
        const nextVersion = highestVersion + 1;

        const [row] = await db
          .insert(checklistTemplates)
          .values({
            tenantId: session.tenantId,
            version: nextVersion,
            serviceType: request.serviceType,
            sections: request.sections,
            passingScore: request.passingScore,
            validFrom: request.validFrom,
            validTo: request.validTo,
          })
          .returning({ id: checklistTemplates.id });

        if (!row) {
          throw new Error("INSERT de template de checklist não retornou id.");
        }

        return { kind: "created", id: row.id, version: nextVersion };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { id: outcome.id, version: outcome.version } };
  } catch (err) {
    return toActionError(err, "Falha ao criar nova versão de checklist.");
  }
}
