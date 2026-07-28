// Checagem de sessão do proxy (Fase 1, Passo 3c) — toda rota autenticada do cockpit passa por
// aqui antes de qualquer Server Action (docs/adr/0008-authn-authz.md).
//
// `getSessionCookie` (subpath `better-auth/cookies`, confirmado em
// node_modules/.pnpm/better-auth@1.6.25.../better-auth/dist/cookies/index.d.mts) só confere a
// PRESENÇA do cookie de sessão (`Request | Headers` -> `string | null`) — nunca toca o banco nem
// valida assinatura/expiração/ability. Isso é deliberado, não uma limitação aceita por preguiça:
// é seguro rodar em qualquer runtime (edge ou nodejs) sem depender do Pool de Postgres que
// `createAuth()` (packages/auth/src/better-auth.config.ts) monta, e mantém a regra dura do
// CLAUDE.md raiz — "Toda Server Action valida e autoriza dentro dela mesma" — como a única fonte
// de verdade para autorização real. Este proxy só decide "há alguém logado ou não"; CASL/ability
// continuam vivendo exclusivamente dentro de cada Server Action.
import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
