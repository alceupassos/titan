// Caminho de LEITURA real de Equipe/Escala (Fase 9, Passo 4b — docs/fase-atual.md) — análogo ao
// caminho de escrita real que já existe em ./actions.ts enquanto as páginas só conseguem
// RENDERIZAR a partir de amostra estática (./sample-data.ts): não há Postgres vivo nesta máquina
// (Docker Desktop parado — "Gap conhecido 2"), então nenhuma função abaixo foi exercitada contra
// um banco de verdade nesta sessão — mas o código é real, não mock, mesma técnica já usada em
// apps/console/app/(staff)/estoque/queries.ts: "trocar a fonte por estas funções é a única
// mudança necessária quando o banco estiver de pé, nunca a lógica das páginas".
import { asc, eq } from "drizzle-orm";
import { accessCredentialEvents, shiftAssignments, withTenant, workforceMembers, type TenantDb } from "@titan/db";
import { activeCredentialsForMember, type AccessCredentialEvent, type WorkforceMember } from "@titan/domain";
import { requireStaffSession } from "@/lib/auth/session";

type WorkforceMemberRow = typeof workforceMembers.$inferSelect;
type AccessCredentialEventRow = typeof accessCredentialEvents.$inferSelect;

/** `zones`/`skills`/`certifications` são `jsonb` sem `$type<>` declarado no schema (typado
 * `unknown` pelo Drizzle) — mesma convenção já usada em ./sample-data.ts: cast explícito para
 * `string[]` na borda de leitura, nunca uma reinterpretação silenciosa. Exportada (não só usada
 * localmente) porque ./actions.ts precisa do mesmo mapeamento ao reconstruir o `WorkforceMember`
 * de dentro da sua própria transação `withTenant`. */
export function toDomainMember(row: WorkforceMemberRow): WorkforceMember {
  return {
    id: row.id,
    tenantId: row.tenantId,
    fullName: row.fullName,
    role: row.role,
    zones: row.zones as string[],
    skills: row.skills as string[],
    certifications: row.certifications as string[],
    employmentType: row.employmentType as WorkforceMember["employmentType"],
    status: row.status as WorkforceMember["status"],
  };
}

/** `reason?: string` em `AccessCredentialEvent` é opcional de verdade (`exactOptionalPropertyTypes`
 * ligado neste monorepo) — atribuir `reason: undefined` explicitamente é erro de tipo distinto de
 * omitir a chave. Por isso o spread condicional abaixo, em vez de `row.reason ?? undefined`. */
function toDomainEvent(row: AccessCredentialEventRow): AccessCredentialEvent {
  return {
    entryHash: row.entryHash,
    prevHash: row.prevHash,
    kind: row.kind as AccessCredentialEvent["kind"],
    memberId: row.memberId,
    credentialType: row.credentialType as AccessCredentialEvent["credentialType"],
    credentialId: row.credentialId,
    ...(row.reason ? { reason: row.reason } : {}),
  };
}

/**
 * Núcleo real de `getAccessCredentialEventsChain` abaixo, recebendo um `TenantDb` já aberto em
 * vez de abrir sua PRÓPRIA transação — existe para que ./actions.ts possa ler a cadeia INTEIRA de
 * DENTRO da mesma transação `withTenant` onde depois grava o(s) evento(s) novo(s)
 * (`issueAccessCredentialAction`/`transferAccessCredentialAction`/`dismissMemberAction`). Chamar
 * `getAccessCredentialEventsChain()` (que abre uma transação/conexão PRÓPRIA) de dentro de um
 * `withTenant` já aberto quebraria a atomicidade "ler cadeia + gravar evento(s) na mesma
 * transação" exigida pelo portão de saída da fase — por isso as Server Actions usam esta função,
 * nunca a outra.
 */
export async function loadAccessCredentialEventsChain(db: TenantDb): Promise<AccessCredentialEvent[]> {
  const rows = await db.select().from(accessCredentialEvents).orderBy(asc(accessCredentialEvents.createdAt));
  return rows.map(toDomainEvent);
}

export async function getWorkforceMembers(): Promise<WorkforceMember[]> {
  const session = await requireStaffSession();
  const rows = await withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db.select().from(workforceMembers),
  );
  return rows.map(toDomainMember);
}

export async function getShiftAssignmentsForMember(memberId: string) {
  const session = await requireStaffSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db.select().from(shiftAssignments).where(eq(shiftAssignments.memberId, memberId)),
  );
}

/** Cadeia INTEIRA de custódia de acesso do tenant, ordenada por `createdAt` (ordem de append) —
 * mesma convenção de "ler a cadeia inteira e reconstruir em memória" já usada para I10 em
 * packages/domain/src/evidence/chain.ts e seus consumidores (ex.
 * apps/console/app/(staff)/limpeza/revisao/[taskId]). `dismissMemberAction`/
 * `issueAccessCredentialAction`/`transferAccessCredentialAction` (./actions.ts) leem exatamente
 * esta função antes de chamar `appendAccessCredentialEvent`/`dismissMember` do domínio. */
export async function getAccessCredentialEventsChain(): Promise<AccessCredentialEvent[]> {
  const session = await requireStaffSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    loadAccessCredentialEventsChain(db),
  );
}

/** Credenciais ativas de um membro — nunca um campo mutável separado, sempre recalculado sobre a
 * cadeia inteira via `activeCredentialsForMember` (packages/domain/src/workforce/access-custody.ts),
 * mesmo princípio de I10 aplicado à custódia de acesso. */
export async function getActiveCredentialsForMember(memberId: string): Promise<AccessCredentialEvent[]> {
  const chain = await getAccessCredentialEventsChain();
  return activeCredentialsForMember(chain, memberId);
}
