"use server";

// Server Actions de Equipe/Escala/Custódia de acesso (Fase 9, Passo 4b — docs/fase-atual.md,
// seção 9.10 do prompt único). Regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e
// autoriza (CASL) dentro dela mesma" — todas as ações abaixo fazem as duas coisas por conta
// própria, sem confiar em nenhuma checagem anterior (nem no `proxy.ts`). Mesmo estilo de
// apps/console/app/(staff)/limpeza/actions.ts e .../estoque/actions.ts — leia os dois antes de
// mexer aqui.
//
// Verbos CASL escolhidos para "workforce_member" (subject único — ver comentário de justificativa
// em packages/auth/src/abilities.ts): "create" para cadastro (onboard) e emissão de credencial
// nova (issue); "update" para responder escala, reatribuir/transferir credencial existente; e
// "approve", exclusivamente, para o desligamento — a consequência de maior impacto deste subject
// (revoga TODA credencial ativa do membro na mesma transação).
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  AssignShiftSchema,
  DismissMemberSchema,
  IssueAccessCredentialSchema,
  OnboardMemberSchema,
  RespondToShiftAssignmentSchema,
  TransferAccessCredentialSchema,
} from "@titan/contracts";
import { accessCredentialEvents, shiftAssignments, withTenant, workforceMembers, type TenantDb } from "@titan/db";
import { civilDate } from "@titan/dates";
import {
  appendAccessCredentialEvent,
  assignShift,
  dismissMember,
  respondToShiftAssignment,
  type AccessCredentialEvent,
  type ShiftStatus,
} from "@titan/domain";
import { NoActiveTenantError, requireStaffSession, UnauthenticatedError } from "@/lib/auth/session";
import { loadAccessCredentialEventsChain, toDomainMember } from "./queries";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Mesmo padrão de apps/console/app/(staff)/limpeza/actions.ts e .../estoque/actions.ts. */
function toActionError(err: unknown, fallback: string): { ok: false; error: string } {
  if (err instanceof UnauthenticatedError || err instanceof NoActiveTenantError) {
    return { ok: false, error: err.message };
  }
  if (err instanceof Error) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: fallback };
}

/** `hashFn` real desta faixa — `node:crypto` é permitido na borda `apps/console`, nunca dentro de
 * `packages/domain` (zero I/O é regra do PACOTE DE DOMÍNIO, não desta Server Action). */
function sha256HashFn(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

type OnboardOutcome = { kind: "onboarded"; memberId: string };

export async function onboardMemberAction(input: unknown): Promise<ActionResult<{ memberId: string }>> {
  const parsed = OnboardMemberSchema.safeParse(input);
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

  if (session.ability.cannot("create", "workforce_member")) {
    return { ok: false, error: "Sem permissão para cadastrar membro da equipe com o papel atual." };
  }

  try {
    const outcome = await withTenant<OnboardOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [row] = await db
          .insert(workforceMembers)
          .values({
            tenantId: session.tenantId,
            fullName: request.fullName,
            role: request.role,
            zones: request.zones,
            skills: request.skills,
            certifications: request.certifications,
            employmentType: request.employmentType,
            status: "active",
          })
          .returning({ id: workforceMembers.id });

        if (!row) {
          throw new Error("INSERT de workforce_member não retornou id.");
        }
        return { kind: "onboarded", memberId: row.id };
      },
    );
    return { ok: true, data: { memberId: outcome.memberId } };
  } catch (err) {
    return toActionError(err, "Falha ao cadastrar membro da equipe.");
  }
}

type AssignShiftOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "assigned"; shiftAssignmentId: string; status: string };

/**
 * Atribui escala a um membro. `assignShift` (packages/domain/src/workforce/assignment.ts) gera um
 * `id` DETERMINÍSTICO (`${memberId}:${date}`) que é o `id` de DOMÍNIO, nunca o `id` da linha —
 * `shift_assignments.id` é `uuid().defaultRandom()`, deixado o Postgres gerar via `.returning()`.
 * Usamos só `memberId`/`date`/`status` do objeto retornado para montar o INSERT.
 */
export async function assignShiftAction(
  input: unknown,
): Promise<ActionResult<{ shiftAssignmentId: string; status: string }>> {
  const parsed = AssignShiftSchema.safeParse(input);
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

  if (session.ability.cannot("create", "workforce_member")) {
    return { ok: false, error: "Sem permissão para atribuir escala com o papel atual." };
  }

  try {
    const outcome = await withTenant<AssignShiftOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [memberRow] = await db
          .select()
          .from(workforceMembers)
          .where(eq(workforceMembers.id, request.memberId));
        if (!memberRow) {
          return { kind: "business-error", error: "Membro da equipe não encontrado." };
        }
        const member = toDomainMember(memberRow);

        const assignment = assignShift(member.id, civilDate(request.date), member.employmentType);

        const [row] = await db
          .insert(shiftAssignments)
          .values({
            tenantId: session.tenantId,
            memberId: assignment.memberId,
            date: assignment.date,
            status: assignment.status,
          })
          .returning({ id: shiftAssignments.id });

        if (!row) {
          throw new Error("INSERT de shift_assignment não retornou id.");
        }
        return { kind: "assigned", shiftAssignmentId: row.id, status: assignment.status };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { shiftAssignmentId: outcome.shiftAssignmentId, status: outcome.status } };
  } catch (err) {
    return toActionError(err, "Falha ao atribuir escala.");
  }
}

type RespondOutcome = { kind: "business-error"; error: string } | { kind: "responded"; status: string };

export async function respondToShiftAssignmentAction(
  input: unknown,
): Promise<ActionResult<{ status: string }>> {
  const parsed = RespondToShiftAssignmentSchema.safeParse(input);
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

  if (session.ability.cannot("update", "workforce_member")) {
    return { ok: false, error: "Sem permissão para responder escala com o papel atual." };
  }

  try {
    const outcome = await withTenant<RespondOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [assignmentRow] = await db
          .select()
          .from(shiftAssignments)
          .where(eq(shiftAssignments.id, request.shiftAssignmentId));
        if (!assignmentRow) {
          return { kind: "business-error", error: "Atribuição de escala não encontrada." };
        }

        const [memberRow] = await db
          .select()
          .from(workforceMembers)
          .where(eq(workforceMembers.id, assignmentRow.memberId));
        if (!memberRow) {
          return { kind: "business-error", error: "Membro da equipe da atribuição não encontrado." };
        }
        const member = toDomainMember(memberRow);

        let updated;
        try {
          updated = respondToShiftAssignment(
            {
              id: assignmentRow.id,
              memberId: assignmentRow.memberId,
              date: civilDate(assignmentRow.date),
              status: assignmentRow.status as ShiftStatus,
            },
            member.employmentType,
            request.response,
          );
        } catch (err) {
          // `MandatoryAssignmentCannotBeDeclinedError` (escala mandatory de employee) vira
          // mensagem de negócio clara aqui, nunca uma exceção não tratada visível ao cliente.
          return {
            kind: "business-error",
            error: err instanceof Error ? err.message : "Não foi possível responder a esta escala.",
          };
        }

        await db
          .update(shiftAssignments)
          .set({ status: updated.status })
          .where(eq(shiftAssignments.id, assignmentRow.id));

        return { kind: "responded", status: updated.status };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { status: outcome.status } };
  } catch (err) {
    return toActionError(err, "Falha ao responder escala.");
  }
}

type IssueOutcome = { kind: "issued"; credentialId: string };

/**
 * Emite uma nova credencial de acesso — lê a cadeia INTEIRA do tenant, reconstrói em memória,
 * chama `appendAccessCredentialEvent` do domínio (que retorna a cadeia ATUALIZADA) e insere só a
 * ÚLTIMA linha (a nova) em `access_credential_events` — mesmo padrão de I10/`evidence/chain.ts`
 * já usado em fases anteriores.
 */
export async function issueAccessCredentialAction(
  input: unknown,
): Promise<ActionResult<{ credentialId: string }>> {
  const parsed = IssueAccessCredentialSchema.safeParse(input);
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

  if (session.ability.cannot("create", "workforce_member")) {
    return { ok: false, error: "Sem permissão para emitir credencial de acesso com o papel atual." };
  }

  try {
    const outcome = await withTenant<IssueOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        // Lida DA MESMA TRANSAÇÃO `db` (nunca via `getAccessCredentialEventsChain()`, que abriria
        // sua PRÓPRIA conexão/transação e quebraria a leitura-antes-de-gravar atômica).
        const chain = await loadAccessCredentialEventsChain(db);
        const updatedChain = appendAccessCredentialEvent(
          chain,
          {
            kind: "issued",
            memberId: request.memberId,
            credentialType: request.credentialType,
            credentialId: request.credentialId,
          },
          sha256HashFn,
        );
        const newEvent = updatedChain[updatedChain.length - 1]!;

        await insertAccessCredentialEvent(db, session.tenantId, newEvent);

        return { kind: "issued", credentialId: newEvent.credentialId };
      },
    );
    return { ok: true, data: { credentialId: outcome.credentialId } };
  } catch (err) {
    return toActionError(err, "Falha ao emitir credencial de acesso.");
  }
}

type TransferOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "transferred"; credentialId: string };

export async function transferAccessCredentialAction(
  input: unknown,
): Promise<ActionResult<{ credentialId: string }>> {
  const parsed = TransferAccessCredentialSchema.safeParse(input);
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

  if (session.ability.cannot("update", "workforce_member")) {
    return { ok: false, error: "Sem permissão para transferir credencial de acesso com o papel atual." };
  }

  try {
    const outcome = await withTenant<TransferOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        // Mesma nota de atomicidade de issueAccessCredentialAction acima.
        const chain = await loadAccessCredentialEventsChain(db);
        // `credentialType` não vem no contrato de transferência (packages/contracts/src/
        // workforce.ts::TransferAccessCredentialSchema só tem credentialId/fromMemberId/
        // toMemberId) — resolvido a partir do evento mais recente da própria credencial na cadeia,
        // nunca inventado/assumido.
        const latestForCredential = [...chain]
          .reverse()
          .find((event) => event.credentialId === request.credentialId);
        if (!latestForCredential || latestForCredential.kind === "revoked") {
          return {
            kind: "business-error",
            error: `Credencial "${request.credentialId}" não encontrada (ou já revogada) na cadeia de custódia.`,
          };
        }
        // `fromMemberId` é conferido contra o dono ATUAL na cadeia (nunca confiado só porque veio
        // no request) — evita transferir uma credencial "de" alguém que não é mais o dono real.
        if (latestForCredential.memberId !== request.fromMemberId) {
          return {
            kind: "business-error",
            error: `Credencial "${request.credentialId}" não pertence atualmente ao membro informado em "fromMemberId".`,
          };
        }

        const updatedChain = appendAccessCredentialEvent(
          chain,
          {
            kind: "transferred",
            memberId: request.toMemberId, // novo dono.
            credentialType: latestForCredential.credentialType,
            credentialId: request.credentialId,
          },
          sha256HashFn,
        );
        const newEvent = updatedChain[updatedChain.length - 1]!;

        await insertAccessCredentialEvent(db, session.tenantId, newEvent);

        return { kind: "transferred", credentialId: newEvent.credentialId };
      },
    );
    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { credentialId: outcome.credentialId } };
  } catch (err) {
    return toActionError(err, "Falha ao transferir credencial de acesso.");
  }
}

type DismissOutcome =
  | { kind: "business-error"; error: string }
  | { kind: "dismissed"; revokedCount: number };

/**
 * Desliga um membro — dentro de UMA `withTenant`: busca o membro, busca a cadeia INTEIRA de
 * `access_credential_events` do tenant, chama `dismissMember` (packages/domain/src/workforce/
 * offboarding.ts, PORTÃO DE SAÍDA da Fase 9: "revogação de desligamento provada"), faz `UPDATE
 * workforce_members.status='dismissed'` E `INSERT` de TODOS os `revocationEvents` retornados na
 * MESMA transação — nunca em dois passos separados.
 */
export async function dismissMemberAction(
  input: unknown,
): Promise<ActionResult<{ revokedCount: number }>> {
  const parsed = DismissMemberSchema.safeParse(input);
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

  // "approve", não "update" — desligamento é a consequência de maior impacto deste subject
  // (revoga acesso de alguém), mesmo padrão de "approve" sobre "payout_batch"/"fiscal_document".
  if (session.ability.cannot("approve", "workforce_member")) {
    return { ok: false, error: "Sem permissão para desligar membro da equipe com o papel atual." };
  }

  try {
    const outcome = await withTenant<DismissOutcome>(
      { tenantId: session.tenantId, actorId: session.userId },
      async (db) => {
        const [memberRow] = await db
          .select()
          .from(workforceMembers)
          .where(eq(workforceMembers.id, request.memberId));
        if (!memberRow) {
          return { kind: "business-error", error: "Membro da equipe não encontrado." };
        }
        const member = toDomainMember(memberRow);

        // Mesma nota de atomicidade de issueAccessCredentialAction acima — CRÍTICO aqui: ler a
        // cadeia fora desta transação abriria uma janela onde `dismissMember` calcularia
        // `revocationEvents` sobre uma cadeia que já não é a mais recente no momento do INSERT.
        const chain = await loadAccessCredentialEventsChain(db);

        let result;
        try {
          result = dismissMember(member, chain, request.reason, sha256HashFn);
        } catch (err) {
          return {
            kind: "business-error",
            error: err instanceof Error ? err.message : "Não foi possível desligar este membro.",
          };
        }

        await db
          .update(workforceMembers)
          .set({ status: result.dismissedMember.status })
          .where(eq(workforceMembers.id, member.id));

        for (const event of result.revocationEvents) {
          await insertAccessCredentialEvent(db, session.tenantId, event);
        }

        return { kind: "dismissed", revokedCount: result.revocationEvents.length };
      },
    );

    if (outcome.kind === "business-error") {
      return { ok: false, error: outcome.error };
    }
    return { ok: true, data: { revokedCount: outcome.revokedCount } };
  } catch (err) {
    return toActionError(err, "Falha ao desligar membro da equipe.");
  }
}

/** Insere uma única linha nova de `access_credential_events` a partir de um
 * `AccessCredentialEvent` de domínio já encadeado (hash calculado) — helper compartilhado por
 * `issueAccessCredentialAction`/`transferAccessCredentialAction`/`dismissMemberAction` para nunca
 * duplicar o mapeamento domínio -> linha em três lugares. */
async function insertAccessCredentialEvent(
  db: TenantDb,
  tenantId: string,
  event: AccessCredentialEvent,
): Promise<void> {
  await db.insert(accessCredentialEvents).values({
    tenantId,
    entryHash: event.entryHash,
    prevHash: event.prevHash,
    kind: event.kind,
    memberId: event.memberId,
    credentialType: event.credentialType,
    credentialId: event.credentialId,
    reason: event.reason ?? null,
  });
}
