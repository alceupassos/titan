// Caminho de LEITURA real do Portal do Prestador (Fase 7, Passo 4a — docs/fase-atual.md) —
// análogo ao caminho de leitura real do Owner Portal (apps/console/app/(owner)/portal/queries.ts):
// não há Postgres vivo nesta máquina (Docker Desktop parado — "Gap conhecido 2" de
// docs/fase-atual.md), então nenhuma função abaixo foi exercitada contra um banco de verdade nesta
// sessão — mas o código é real, não mock, e é o que troca a fonte de dados das páginas assim que o
// Postgres estiver de pé (./page.tsx e ./pagamentos/page.tsx seguem renderizando a partir de
// ./sample-data.ts até lá).
//
// LACUNA CONHECIDA herdada de apps/console/lib/auth/vendor-session.ts: sem mapeamento persistido
// usuário -> prestador, as duas funções abaixo recebem `vendorId` como PARÂMETRO EXPLÍCITO do
// chamador (nunca inferido da sessão) — a sessão real só garante "existe um usuário autenticado
// com tenant ativo", `requireVendorSession()` é chamado aqui só para não deixar nenhuma leitura
// deste portal passar sem sessão válida nenhuma, não para descobrir o prestador.
import { eq } from "drizzle-orm";
import { accountsPayable, withTenant, workOrders } from "@titan/db";
import { requireVendorSession } from "@/lib/auth/vendor-session";

/** Todas as `work_orders` atribuídas a `vendorId` no tenant ativo da sessão. */
export async function getVendorWorkOrders(vendorId: string) {
  const session = await requireVendorSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db.select().from(workOrders).where(eq(workOrders.vendorId, vendorId)),
  );
}

/** Todas as `accounts_payable` de `vendorId` no tenant ativo, mais recentes primeiro — a
 * listagem real que alimenta ./pagamentos/page.tsx quando o Postgres estiver de pé. Inclui TODOS
 * os status (não só "paid") para o chamador decidir a filtragem de exibição — mesmo espírito de
 * apps/console/app/(owner)/portal/queries.ts::getOwnerPayoutBatches, que também devolve tudo e
 * deixa a página filtrar. */
export async function getVendorPayments(vendorId: string) {
  const session = await requireVendorSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId }, (db) =>
    db.select().from(accountsPayable).where(eq(accountsPayable.vendorId, vendorId)),
  );
}
