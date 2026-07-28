// Sessão do proprietário para o Owner Portal (apps/console/app/(owner)/portal/**) — Fase 5,
// Passo 4c (docs/fase-atual.md). Mesmo padrão de `requireStaffSession()` (./session.ts): o
// Better Auth é a fonte de verdade de autenticação (assinatura/expiração validadas de verdade via
// `auth.api.getSession`), nunca `getSessionCookie` (que só confere presença do cookie — ver
// apps/console/proxy.ts). As classes de erro (`UnauthenticatedError`/`NoActiveTenantError`) são
// REUSADAS de `./session.ts` (reexportadas abaixo) — sessão ausente ou tenant sem organização
// ativa é o mesmo problema estrutural para staff e para proprietário; duplicar o tipo/a mensagem
// não acrescentaria nenhuma garantia extra.
//
// Custo aceito da reutilização parcial: como este arquivo não importa `getAuth()` de `./session.ts`
// (não exportado de lá, e esta faixa está restrita a só CRIAR `owner-session.ts`, nunca editar
// `session.ts`), o cache de `createAuth()` abaixo é um SEGUNDO `Pool` de Postgres próprio deste
// módulo — não o mesmo pool já cacheado pelo lado staff. Sem consequência prática nesta fase (sem
// Postgres vivo nesta máquina, "Gap conhecido 2" de docs/fase-atual.md); vale revisitar quando o
// Owner Portal for exercitado contra um Postgres real (unificar os dois resolvers de sessão atrás
// de um único `getAuth()` compartilhado, quando o bounded context `identity` nascer).
//
// LACUNA CONHECIDA (mesma classe de dívida técnica documentada em `./session.ts` desde a Fase 1,
// Passo 5 — "não existe mapeamento persistido usuário -> papel Titan"): também não existe, em
// NENHUM lugar do monorepo, um mapeamento persistido usuário -> proprietário nem
// proprietário -> unidade (`ownership_share`, ver docs/domain/modelo-dominio.md, seção 1 —
// bounded context `owner_portal`/`identity` ainda não modelado). Enquanto essa tabela não existe:
//   1. Toda sessão válida do Better Auth com tenant ativo é tratada como papel `"owner"` — nunca um
//      papel mais privilegiado é inferido, exatamente como `requireStaffSession()` trata toda
//      sessão válida como `"titan.operations"`.
//   2. O filtro "só as unidades deste proprietário" que `packages/auth/src/abilities.ts` já
//      documenta em comentário (`can("read","reservation") // só das próprias unidades — filtro
//      de ownership_share na query`) NÃO é aplicado aqui — nem por esta função, nem por
//      `./queries.ts`. Uma query real feita com o `tenantId` desta sessão enxergaria TODAS as
//      unidades do tenant, não só as do proprietário logado. Isto é aceitável para o portão desta
//      fase (sem Postgres vivo, nenhuma query real roda de fato ainda — ver `./queries.ts`), mas é
//      BLOQUEANTE antes de abrir este portal para um proprietário real: o bounded context
//      `owner_portal`/`identity` precisa nascer (tabela `ownership_share` ou equivalente) antes
//      disso, nunca um filtro client-side ou um `WHERE` improvisado sobre um campo que não existe.
import { headers } from "next/headers";
import { createAuth, defineAbilityFor, type AppAbility, type Role } from "@titan/auth";
import { NoActiveTenantError, UnauthenticatedError } from "./session";

export { UnauthenticatedError, NoActiveTenantError };

export interface OwnerSession {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: Role;
  readonly ability: AppAbility;
}

let cachedAuth: ReturnType<typeof createAuth> | undefined;

function getAuth(): ReturnType<typeof createAuth> {
  cachedAuth ??= createAuth();
  return cachedAuth;
}

/**
 * Resolve a sessão real do proprietário (assinatura/expiração validadas pelo próprio Better Auth)
 * a partir dos headers da requisição atual e devolve já com a ability CASL do papel `"owner"`.
 * Lança `UnauthenticatedError`/`NoActiveTenantError` em vez de devolver `null` — nenhum código do
 * Owner Portal deve prosseguir "mesmo assim" sem sessão ou sem tenant ativo (regra dura do
 * CLAUDE.md raiz, mesma aplicada por `requireStaffSession()`).
 */
export async function requireOwnerSession(): Promise<OwnerSession> {
  const auth = getAuth();
  const incomingHeaders = await headers();
  const session = await auth.api.getSession({ headers: incomingHeaders });

  if (!session) {
    throw new UnauthenticatedError();
  }

  const tenantId = session.session.activeOrganizationId;
  if (!tenantId) {
    throw new NoActiveTenantError();
  }

  // Ver lacuna conhecida no cabeçalho do arquivo: sem mapeamento usuário -> proprietário
  // persistido, toda sessão válida com tenant ativo é tratada como o papel mínimo `"owner"`.
  const role: Role = "owner";

  return {
    userId: session.user.id,
    tenantId,
    role,
    ability: defineAbilityFor(role),
  };
}
