// Caminho de LEITURA real do Owner Portal — análogo ao caminho de ESCRITA real que já existe em
// outras rotas do cockpit (ex.: apps/console/app/(staff)/fiscal/actions.ts) enquanto a página só
// consegue RENDERIZAR a partir de amostra estática (./sample-data.ts): não há Postgres vivo nesta
// máquina (Docker Desktop parado — "Gap conhecido 2" de docs/fase-atual.md), então nenhuma função
// abaixo foi exercitada contra um banco de verdade nesta sessão — mas o código é real, não mock,
// e é o que troca a fonte de dados das páginas assim que o Postgres estiver de pé (mesma técnica
// já descrita nos comentários de .../fiscal/page.tsx e .../distribuicao/page.tsx: "trocar a fonte
// por withTenant(...).select()... é a única mudança necessária, nunca a lógica").
//
// LACUNA CONHECIDA herdada de apps/console/lib/auth/owner-session.ts: sem `ownership_share`
// persistida (usuário -> proprietário -> unidade), as duas funções abaixo filtram só por
// `tenantId` (via `withTenant`) — NÃO por "unidades deste proprietário". Isso é aceitável hoje
// (nenhuma delas roda de fato sem Postgres vivo), mas bloqueante antes de expor este portal a um
// proprietário real: adicionar o filtro de unidade aqui é a mudança mínima quando aquele bounded
// context nascer, sem precisar tocar nas páginas que consomem estas funções.
import { eq } from "drizzle-orm";
import { administrationContracts, payoutBatches, units, withTenant } from "@titan/db";
import { requireOwnerSession } from "@/lib/auth/owner-session";

/** Todas as unidades do tenant ativo da sessão do proprietário — ver lacuna de `ownership_share`
 * no cabeçalho deste arquivo: hoje isto é "todas as unidades do tenant", não "as unidades deste
 * proprietário". */
export async function getOwnerUnits() {
  const session = await requireOwnerSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId, ownerScope: session.userId }, (db) =>
    db.select().from(units),
  );
}

/** Todos os `administration_contracts` do tenant ativo — usado para resolver `itemPaymentModel`
 * por unidade+período (ver `./helpers.ts::resolveItemPaymentModelForBatch`). */
export async function getOwnerAdministrationContracts() {
  const session = await requireOwnerSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId, ownerScope: session.userId }, (db) =>
    db.select().from(administrationContracts),
  );
}

/** Todos os `payout_batches` do tenant ativo — a listagem real que alimenta
 * ./extratos/page.tsx e os KPIs de ./page.tsx quando o Postgres estiver de pé. */
export async function getOwnerPayoutBatches() {
  const session = await requireOwnerSession();
  return withTenant({ tenantId: session.tenantId, actorId: session.userId, ownerScope: session.userId }, (db) =>
    db.select().from(payoutBatches).orderBy(payoutBatches.periodStart),
  );
}

/** Um único `payout_batch` por id — reservado para a rota de detalhe de extrato (fora de escopo
 * desta faixa). Mantido aqui, real e tipado, para não deixar a próxima faixa reinventar a mesma
 * query — nunca chamada nesta sessão (ver cabeçalho do arquivo). */
export async function getOwnerPayoutBatchById(id: string) {
  const session = await requireOwnerSession();
  const rows = await withTenant(
    { tenantId: session.tenantId, actorId: session.userId, ownerScope: session.userId },
    (db) => db.select().from(payoutBatches).where(eq(payoutBatches.id, id)),
  );
  return rows[0] ?? null;
}
