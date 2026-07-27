// Stub de autenticação — Fase 0 só prova a forma; a checagem real de sessão/ability entra
// quando @titan/auth tiver rotas de cockpit reais para proteger (Fase 1+). Toda rota autenticada
// do cockpit passa por aqui antes de qualquer Server Action (docs/adr/0008-authn-authz.md).
import { NextResponse, type NextRequest } from "next/server";

export function proxy(_request: NextRequest) {
  // TODO(Fase 1): validar sessão do Better Auth aqui; redirecionar para login se ausente.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
