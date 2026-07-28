// Sessão do app de campo (apps/console/app/api/field/**) — Fase 9, Passo 5 (docs/fase-atual.md).
// Mesmo padrão de `requireVendorSession()`/`requireOwnerSession()`: o Better Auth é a fonte de
// verdade de autenticação (assinatura/expiração validadas de verdade via `auth.api.getSession`,
// nunca `getSessionCookie` — ver apps/console/proxy.ts). As classes de erro
// (`UnauthenticatedError`/`NoActiveTenantError`) são REUSADAS de `./session.ts` — sessão ausente
// ou tenant sem organização ativa é o mesmo problema estrutural em toda superfície do monorepo.
//
// Diferença real desta sessão (Route Handler, não Server Action/página): o app nativo (Expo)
// autentica via cookie de sessão do Better Auth do mesmo jeito que o cockpit web — não há SDK
// separado de auth para app nativo nesta fase (fora de escopo; sem infra de auth mobile
// configurada nesta sessão).
//
// Custo aceito da reutilização parcial (mesmo já documentado em vendor-session.ts/
// owner-session.ts): cache de `createAuth()` próprio deste módulo (quarto `Pool` de Postgres) —
// sem consequência prática sem Postgres vivo nesta máquina (Gap conhecido 2).
//
// LACUNA CONHECIDA (mesma classe de dívida técnica de todas as sessões externas anteriores): não
// existe mapeamento persistido usuário -> membro da equipe (`workforce_member.id`). Toda sessão
// válida com tenant ativo é tratada como papel mínimo `"titan.field"`; `memberId` continua sendo
// PARÂMETRO EXPLÍCITO em toda chamada que precisa saber "qual membro é este", nunca inferido daqui
// — mesmo princípio de `vendorId` em vendor-session.ts.
import { headers } from "next/headers";
import { createAuth, defineAbilityFor, type AppAbility, type Role } from "@titan/auth";
import { NoActiveTenantError, UnauthenticatedError } from "./session";

export { UnauthenticatedError, NoActiveTenantError };

export interface FieldSession {
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
 * Resolve a sessão real do app de campo a partir dos headers da requisição atual e devolve já com
 * a ability CASL do papel `"titan.field"`. Lança `UnauthenticatedError`/`NoActiveTenantError` em
 * vez de devolver `null` — nenhum Route Handler deve prosseguir "mesmo assim" sem sessão/tenant.
 */
export async function requireFieldSession(): Promise<FieldSession> {
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

  const role: Role = "titan.field";

  return {
    userId: session.user.id,
    tenantId,
    role,
    ability: defineAbilityFor(role),
  };
}
