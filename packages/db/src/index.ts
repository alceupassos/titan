export * from "./schema";
export { withTenant, closePool, InvalidTenantIdError } from "./client";
export type { TenantContext, TenantDb } from "./client";

// Um `db` global (drizzle cru sobre o pool inteiro) é DELIBERADAMENTE não exportado daqui
// (achado F-9 da auditoria de segurança da Fase 0): qualquer query fora de `withTenant()` roda
// sem `app.tenant_id` setado, e a política RLS trata isso como zero linhas (fail-closed) —
// silencioso, não um erro claro. Toda leitura/escrita tenant-scoped passa por
// `withTenant(ctx, (db) => ...)`, que entrega uma instância drizzle já vinculada à transação e
// à conexão física corretas.
