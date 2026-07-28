// Autenticação self-hosted (docs/adr/0008-authn-authz.md). Cookie httpOnly+Secure+SameSite=Lax,
// MFA obrigatório para staff Titan e proprietário com permissão financeira (seção 5.3 do prompt
// único). As tabelas geradas por estes plugins (organization, twoFactor, passkey, magicLink)
// entram via `migration-writer`, nunca escritas à mão em packages/db.
import { betterAuth } from "better-auth";
import { organization, twoFactor, magicLink } from "better-auth/plugins";
// passkey é um plugin companheiro em pacote separado, não um subpath de better-auth
// (confirmado no export map instalado: better-auth@1.6.25 não expõe ./plugins/passkey).
import { passkey } from "@better-auth/passkey";
import { Pool } from "pg";

export function createAuth() {
  return betterAuth({
    // `titan_app` (não-superusuário) — nunca `titan` (achado F-1 da auditoria de segurança de
    // F0, também presente aqui e corrigido junto: qualquer conexão como superusuário ignora
    // FORCE ROW LEVEL SECURITY, inclusive nas tabelas que o próprio Better Auth gerencia).
    database: new Pool({
      connectionString:
        process.env.DATABASE_URL ?? "postgresql://titan_app:titan_app_dev_only@localhost:6432/titan_dev",
    }),
    // Necessário atrás de proxy reverso (nginx+Cloudflare, docs/adr/0002): sem `baseURL`
    // explícito, Better Auth deriva a origem da requisição recebida, o que pode confundir
    // cookie/redirect quando o TLS termina no Cloudflare, não no processo Node. `trustedOrigins`
    // é o mesmo host — a verificação de Origin do Better Auth não aceita nada fora desta lista.
    baseURL: process.env.BETTER_AUTH_URL,
    trustedOrigins: process.env.BETTER_AUTH_URL ? [process.env.BETTER_AUTH_URL] : undefined,
    // Passwordless por padrão na área do hóspede (seção 7.1) — magic-link/OTP cobre isso; staff
    // e proprietário com acesso financeiro usam MFA obrigatório via twoFactor/passkey.
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    session: {
      cookieCache: { enabled: true },
    },
    plugins: [
      organization({
        // Um "organization" do Better Auth mapeia para um tenant da Titan (packages/db `tenants`).
        allowUserToCreateOrganization: false, // só via fluxo administrativo, nunca self-serve
      }),
      twoFactor(),
      passkey(),
      magicLink({
        sendMagicLink: async ({ email }) => {
          // TODO(Fase 2): plugar provedor transacional (Resend/SES/Postmark) — nunca SMTP da
          // VPS (seção 4.4.4 do prompt único). Placeholder até o pacote de e-mail existir.
          //
          // Nunca logar `url` nem `email` (achado da varredura de convenção da Fase 0): a URL
          // do magic link É uma credencial de bearer — quem a lê faz login como esse usuário —
          // e o e-mail é PII. `pino` com `redact` ainda não existe neste pacote (F0); até lá,
          // nem placeholder de desenvolvimento deve escrever nenhum dos dois em log.
          console.log("[auth] magic link solicitado (destinatário e URL omitidos do log de propósito)");
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
