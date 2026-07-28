// Resolução de tenant do storefront público (Fase 2, Passo 4c — docs/fase-atual.md).
//
// O storefront NÃO é uma superfície multi-tenant do ponto de vista do hóspede: é a vitrine
// pública de UMA operação (Titan Empreendimentos — ver PRODUCT.md raiz, "A self-hosted platform
// for Titan Empreendimentos' short-term-rental operation"). `withTenant()` (@titan/db) ainda
// exige um `tenantId` explícito em toda query (RLS multi-tenant, docs/adr/0007) — mas aqui não há
// sessão de hóspede autenticado nem fluxo de seleção de organização (isso só existe para staff,
// via `session.session.activeOrganizationId` em apps/console/lib/auth/session.ts). Em vez de
// inventar uma resolução de tenant que não existe (ex.: adivinhar por domínio), o tenant do
// storefront é um valor de configuração de implantação: `TITAN_STOREFRONT_TENANT_ID`.
//
// Mesma disciplina de `NoActiveTenantError` do cockpit: recusa com erro claro em vez de seguir
// sem tenant. Ver `apps/web/.env.example`.
export class StorefrontTenantNotConfiguredError extends Error {
  constructor() {
    super(
      "TITAN_STOREFRONT_TENANT_ID não configurado — o storefront não sabe de qual tenant " +
        "servir unidades/tarifas/reservas. Ver apps/web/.env.example.",
    );
    this.name = "StorefrontTenantNotConfiguredError";
  }
}

export function resolveStorefrontTenantId(): string {
  const tenantId = process.env.TITAN_STOREFRONT_TENANT_ID;
  if (!tenantId) {
    throw new StorefrontTenantNotConfiguredError();
  }
  return tenantId;
}

// Ator técnico para `withTenant({ actorId, ... })` em toda leitura/escrita anônima deste app —
// nunca um userId real (não existe usuário autenticado na maior parte deste funil; login via
// magic-link, quando implementado, passa a fornecer um `actorId` real para quem estiver logado).
// Alimenta `audit_log`/RLS de auditoria (mesmo papel de `SEED_ACTOR_ID` em packages/db/seed).
export const STOREFRONT_ACTOR_ID = "storefront-guest";
