// Caminho de LEITURA real de /pricing (Fase 8, Passo 5) — mesmo padrão de leitura real "pronta,
// mas não exercitada contra Postgres vivo" já usado em todas as fases anteriores (Gap conhecido 2,
// docs/fase-atual.md).
import { desc, eq } from "drizzle-orm";
import { pricingSnapshots, withTenant } from "@titan/db";
import { requireStaffSession } from "@/lib/auth/session";

export async function getRecentPricingSnapshots(unitId: string, limit = 30) {
  const session = await requireStaffSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db
      .select()
      .from(pricingSnapshots)
      .where(eq(pricingSnapshots.unitId, unitId))
      .orderBy(desc(pricingSnapshots.date))
      .limit(limit),
  );
}
