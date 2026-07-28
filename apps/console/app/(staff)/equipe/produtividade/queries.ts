// Caminho de LEITURA real do painel de Produtividade (Fase 9, Passo 4c — docs/fase-atual.md) —
// mesmo padrão de ../queries.ts e apps/console/app/(staff)/estoque/queries.ts:
// `requireStaffSession()` + `withTenant`, código real (não mock) mesmo sem Postgres vivo nesta
// máquina (Docker Desktop parado — "Gap conhecido 2") para exercitar contra.
import { asc } from "drizzle-orm";
import { taskCompletionRecords, withTenant } from "@titan/db";
import type { TaskCompletionRecord } from "@titan/domain";
import { requireStaffSession } from "@/lib/auth/session";

type TaskCompletionRecordRow = typeof taskCompletionRecords.$inferSelect;

/** `evidenceHashes` é `jsonb` sem `$type<>` declarado no schema (typado `unknown` pelo Drizzle) —
 * cast explícito para `string[]` na borda de leitura, mesma convenção de `toDomainMember` em
 * ../queries.ts. `completedAt` (Date) vira `completedAtEpochMs` (number) — o domínio
 * (`packages/domain/src/workforce/productivity.ts`) trabalha só com epoch millis, nunca com
 * `Date`. */
function toDomainRecord(row: TaskCompletionRecordRow): TaskCompletionRecord {
  return {
    memberId: row.memberId,
    taskId: row.taskId,
    completedAtEpochMs: row.completedAt.getTime(),
    evidenceHashes: row.evidenceHashes as string[],
  };
}

/** Todos os `task_completion_records` do tenant, ordenados por `completedAt` (ordem de
 * conclusão) — `flagSuspiciousCompletions`/`computeProductivityScore` fazem a própria agregação
 * por membro em memória sobre esta lista completa, nunca uma query pré-filtrada por membro (mesmo
 * princípio de "ler a cadeia/histórico inteiro e derivar" já usado para I10/custódia de acesso). */
export async function getTaskCompletionRecords(): Promise<TaskCompletionRecord[]> {
  const session = await requireStaffSession();
  const rows = await withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db.select().from(taskCompletionRecords).orderBy(asc(taskCompletionRecords.completedAt)),
  );
  return rows.map(toDomainRecord);
}
