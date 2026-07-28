// Sessão do prestador para o Vendor Portal (apps/console/app/(vendor)/portal-prestador/**) —
// Fase 7, Passo 4a (docs/fase-atual.md). Mesmo padrão de `requireOwnerSession()`
// (./owner-session.ts), que por sua vez segue `requireStaffSession()` (./session.ts): o Better
// Auth é a fonte de verdade de autenticação (assinatura/expiração validadas de verdade via
// `auth.api.getSession`, nunca `getSessionCookie` — ver apps/console/proxy.ts). As classes de erro
// (`UnauthenticatedError`/`NoActiveTenantError`) são REUSADAS de `./session.ts` (reexportadas
// abaixo) — sessão ausente ou tenant sem organização ativa é o mesmo problema estrutural para
// staff, proprietário e prestador; duplicar o tipo/a mensagem não acrescentaria nenhuma garantia
// extra.
//
// Custo aceito da reutilização parcial (mesmo já documentado em ./owner-session.ts): como este
// arquivo não importa `getAuth()` de `./session.ts` (não exportado de lá, e esta faixa está
// restrita a só CRIAR `vendor-session.ts`, nunca editar `session.ts`), o cache de `createAuth()`
// abaixo é um TERCEIRO `Pool` de Postgres próprio deste módulo — nem o do lado staff, nem o do
// lado owner. Sem consequência prática nesta fase (sem Postgres vivo nesta máquina, "Gap
// conhecido 2" de docs/fase-atual.md); vale revisitar quando o Vendor Portal for exercitado contra
// um Postgres real (unificar os três resolvers de sessão atrás de um único `getAuth()`
// compartilhado, quando o bounded context `identity` nascer).
//
// LACUNA CONHECIDA (mesma classe de dívida técnica documentada em `./session.ts` desde a Fase 1 e
// em `./owner-session.ts` desde a Fase 5 — "não existe mapeamento persistido usuário -> papel"):
// também não existe, em NENHUM lugar do monorepo, um mapeamento persistido usuário -> prestador
// (`vendor_id`). Enquanto essa tabela não existe:
//   1. Toda sessão válida do Better Auth com tenant ativo é tratada como papel `"vendor"` — nunca
//      um papel mais privilegiado é inferido, exatamente como `requireStaffSession()` trata toda
//      sessão válida como `"titan.operations"` e `requireOwnerSession()` como `"owner"`.
//   2. Nenhuma função deste módulo (nem `./queries.ts`, nem `./actions.ts`) tenta descobrir "qual
//      prestador é este usuário" a partir da sessão. Toda função de leitura ou escrita que precisa
//      saber isso recebe o `vendorId` como PARÂMETRO EXPLÍCITO do chamador, nunca inferido daqui.
//      Isto é aceitável para o portão desta fase (sem Postgres vivo, nenhuma chamada roda de fato
//      ainda — ver `./queries.ts`), mas é BLOQUEANTE antes de abrir este portal a um prestador
//      real: um usuário autenticado poderia hoje, em tese, passar o `vendorId` de OUTRO prestador
//      como parâmetro e a Server Action de transição (`./actions.ts`) só recusa porque confere
//      `row.vendorId === vendorId informado` — não porque sabe quem é o prestador logado. O
//      bounded context `vendors`/`identity` precisa nascer (tabela `user_id -> vendor_id` ou
//      equivalente) antes de expor isto a uma conta de prestador real.
import { headers } from "next/headers";
import { createAuth, defineAbilityFor, type AppAbility, type Role } from "@titan/auth";
import { NoActiveTenantError, UnauthenticatedError } from "./session";

export { UnauthenticatedError, NoActiveTenantError };

export interface VendorSession {
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
 * Resolve a sessão real do prestador (assinatura/expiração validadas pelo próprio Better Auth) a
 * partir dos headers da requisição atual e devolve já com a ability CASL do papel `"vendor"`.
 * Lança `UnauthenticatedError`/`NoActiveTenantError` em vez de devolver `null` — nenhum código do
 * Vendor Portal deve prosseguir "mesmo assim" sem sessão ou sem tenant ativo (regra dura do
 * CLAUDE.md raiz, mesma aplicada por `requireStaffSession()`/`requireOwnerSession()`).
 */
export async function requireVendorSession(): Promise<VendorSession> {
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

  // Ver lacuna conhecida no cabeçalho do arquivo: sem mapeamento usuário -> prestador persistido,
  // toda sessão válida com tenant ativo é tratada como o papel mínimo `"vendor"`.
  const role: Role = "vendor";

  return {
    userId: session.user.id,
    tenantId,
    role,
    ability: defineAbilityFor(role),
  };
}
