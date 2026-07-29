// Leitura real de unidades cadastradas (Planoexplica.md, "cadastrar unidade") — distinto dos 4
// studios de amostra em ./sample-data.ts (esses continuam existindo, servem de demonstração do
// pipeline de pricing/comp-set). Mesmo padrão de apps/console/app/(staff)/reservas/queries.ts:
// leitura dentro de `withTenant`.
import { desc, eq } from "drizzle-orm";
import { units, withTenant } from "@titan/db";
import type { UnitStatus } from "@titan/domain";

export interface RealUnit {
  readonly id: string;
  readonly name: string;
  readonly status: UnitStatus;
  readonly areaSqm: number | null;
  readonly maxCapacity: number | null;
  readonly category: string | null;
}

export async function listRealUnitsForTenant(params: { tenantId: string; actorId: string }): Promise<RealUnit[]> {
  return withTenant({ tenantId: params.tenantId, actorId: params.actorId }, async (db) => {
    const rows = await db
      .select({
        id: units.id,
        name: units.name,
        status: units.status,
        areaSqm: units.areaSqm,
        maxCapacity: units.maxCapacity,
        category: units.category,
      })
      .from(units)
      .where(eq(units.tenantId, params.tenantId))
      .orderBy(desc(units.createdAt));
    return rows.map((row) => ({ ...row, status: row.status as UnitStatus }));
  });
}

export async function getRealUnitById(params: {
  tenantId: string;
  actorId: string;
  unitId: string;
}): Promise<RealUnit | null> {
  return withTenant({ tenantId: params.tenantId, actorId: params.actorId }, async (db) => {
    const [row] = await db
      .select({
        id: units.id,
        name: units.name,
        status: units.status,
        areaSqm: units.areaSqm,
        maxCapacity: units.maxCapacity,
        category: units.category,
      })
      .from(units)
      .where(eq(units.id, params.unitId));
    if (!row) return null;
    return { ...row, status: row.status as UnitStatus };
  });
}
