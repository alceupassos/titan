// Sessão real -> ability CASL (Fase 1, Passo 5 — docs/fase-atual.md). Chamado de DENTRO de cada
// Server Action (regra dura do CLAUDE.md raiz: "Toda Server Action valida (Zod) e autoriza
// (CASL) dentro dela mesma") — nunca confiar só no `proxy.ts`
// (apps/console/proxy.ts), que apenas confere a PRESENÇA do cookie de sessão via
// `getSessionCookie`, sem validar assinatura/expiração nem checar ability nenhuma.
//
// `auth.api.getSession({ headers })` (confirmado nos tipos instalados de `better-auth@1.6.25`,
// node_modules/.pnpm/.../better-auth/dist/api/routes/session.d.mts: `requireHeaders: true`) É a
// checagem de verdade — valida assinatura/expiração contra o banco (ou cookie cache), ao
// contrário de `getSessionCookie`.
//
// LACUNA CONHECIDA (dívida técnica, documentada, não escondida — mesmo padrão de
// docs/fase-atual.md "Gaps conhecidos"): não existe, em NENHUM lugar do monorepo, um mapeamento
// persistido de usuário -> papel Titan (`Role` de @titan/auth). Isso é trabalho do bounded
// context `identity`/`organization` (ainda não modelado; fase futura). Enquanto essa tabela não
// existe, TODA sessão válida do Better Auth é tratada como `"titan.operations"` — o papel mínimo
// já suficiente para o fluxo de cotação/reserva deste passo (após a ability adicionada em
// `packages/auth/src/abilities.ts`). Nunca um papel mais privilegiado é inferido, e nunca se
// "segue mesmo assim" sem sessão ou sem tenant ativo — ver os dois `throw` abaixo.
//
// Da mesma forma, o `tenantId` vem de `session.session.activeOrganizationId` (o plugin
// `organization` do Better Auth mapeia 1:1 para um tenant Titan — packages/auth/src/
// better-auth.config.ts). Não existe ainda nenhum fluxo de UI para o usuário selecionar/ativar
// uma organization nesta sessão (também fase futura) — se o campo vier ausente, a função recusa
// com erro claro em vez de adivinhar um tenant.
import { headers } from "next/headers";
import { createAuth, defineAbilityFor, type AppAbility, type Role } from "@titan/auth";

export class UnauthenticatedError extends Error {
  constructor() {
    super("Sessão ausente ou inválida — faça login novamente.");
    this.name = "UnauthenticatedError";
  }
}

export class NoActiveTenantError extends Error {
  constructor() {
    super(
      "Sessão sem organização ativa (tenant) — nenhum fluxo de seleção de organização existe " +
        "ainda nesta fase; não é possível prosseguir sem um tenant explícito.",
    );
    this.name = "NoActiveTenantError";
  }
}

export interface StaffSession {
  readonly userId: string;
  readonly tenantId: string;
  readonly role: Role;
  readonly ability: AppAbility;
}

// `createAuth()` monta um `Pool` de Postgres próprio (packages/auth/src/better-auth.config.ts) —
// uma única instância por processo do servidor Next, não uma nova a cada chamada de Server
// Action, para não abrir um pool novo por requisição.
let cachedAuth: ReturnType<typeof createAuth> | undefined;

function getAuth(): ReturnType<typeof createAuth> {
  cachedAuth ??= createAuth();
  return cachedAuth;
}

/**
 * Resolve a sessão real (assinatura/expiração validadas pelo próprio Better Auth) a partir dos
 * headers da requisição atual e devolve já com a ability CASL do papel mapeado. Lança
 * `UnauthenticatedError`/`NoActiveTenantError` em vez de devolver `null` — a Server Action
 * chamadora NUNCA deve prosseguir "mesmo assim" na ausência de sessão/tenant (regra dura do
 * CLAUDE.md raiz).
 */
export async function requireStaffSession(): Promise<StaffSession> {
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

  // Ver lacuna conhecida no cabeçalho do arquivo: nenhum papel Titan persistido ainda existe,
  // então toda sessão válida com tenant ativo é tratada como o mínimo necessário para este passo.
  const role: Role = "titan.operations";

  return {
    userId: session.user.id,
    tenantId,
    role,
    ability: defineAbilityFor(role),
  };
}
