-- Schema do Better Auth (core + plugins organization/twoFactor/passkey) — gerado por
-- `pnpm dlx @better-auth/cli generate` a partir de packages/auth/src/better-auth.config.ts.
--
-- NÃO faz parte do journal do drizzle-kit (packages/db/migrations/meta/_journal.json): estas
-- tabelas são de propriedade do Better Auth, não de packages/db/src/schema — não existe
-- declaração Drizzle para elas, então `drizzle-kit generate`/`migrate` nunca as verá. Aplicação
-- real é via `pnpm dlx @better-auth/cli@1.4.21 migrate` (ou execução direta deste arquivo com
-- DATABASE_ADMIN_URL — `titan`, superusuário, requer CREATE na schema public que `titan_app`
-- não tem). Arquivo mantido aqui só para auditoria/histórico do que foi aplicado e quando.
--
-- Sem RLS de propósito: o Pool de `createAuth()` conecta como `titan_app` sem passar por
-- `withTenant()` (nunca seta `app.tenant_id` via `set_config`) — RLS baseada nessa variável de
-- sessão nunca se aplicaria aqui, então não é declarada. Multi-tenancy destas tabelas vem da
-- própria coluna `organizationId` do plugin organization, nunca de RLS por tenant.

create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null, "twoFactorEnabled" boolean);

create table "session" ("id" text not null primary key, "expiresAt" timestamptz not null, "token" text not null unique, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade, "activeOrganizationId" text);

create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "organization" ("id" text not null primary key, "name" text not null, "slug" text not null unique, "logo" text, "createdAt" timestamptz not null, "metadata" text);

create table "member" ("id" text not null primary key, "organizationId" text not null references "organization" ("id") on delete cascade, "userId" text not null references "user" ("id") on delete cascade, "role" text not null, "createdAt" timestamptz not null);

create table "invitation" ("id" text not null primary key, "organizationId" text not null references "organization" ("id") on delete cascade, "email" text not null, "role" text, "status" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "inviterId" text not null references "user" ("id") on delete cascade);

create table "twoFactor" ("id" text not null primary key, "secret" text not null, "backupCodes" text not null, "userId" text not null references "user" ("id") on delete cascade, "verified" boolean, "failedVerificationCount" integer, "lockedUntil" timestamptz);

create table "passkey" ("id" text not null primary key, "name" text, "publicKey" text not null, "userId" text not null references "user" ("id") on delete cascade, "credentialID" text not null, "counter" integer not null, "deviceType" text not null, "backedUp" boolean not null, "transports" text, "createdAt" timestamptz, "aaguid" text);

create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");
create unique index "organization_slug_uidx" on "organization" ("slug");
create index "member_organizationId_idx" on "member" ("organizationId");
create index "member_userId_idx" on "member" ("userId");
create index "invitation_organizationId_idx" on "invitation" ("organizationId");
create index "invitation_email_idx" on "invitation" ("email");
create index "twoFactor_secret_idx" on "twoFactor" ("secret");
create index "twoFactor_userId_idx" on "twoFactor" ("userId");
create index "passkey_userId_idx" on "passkey" ("userId");
create index "passkey_credentialID_idx" on "passkey" ("credentialID");

-- Privilégios para `titan_app` (não-superusuário — mesmo papel de runtime de toda a aplicação).
-- Diferente das tabelas append-only do domínio de negócio, estas precisam de mutação completa
-- (revogar sessão, atualizar verificação de e-mail, trocar organização ativa etc.).
grant select, insert, update, delete on "user", "session", "account", "verification",
  "organization", "member", "invitation", "twoFactor", "passkey" to titan_app;
