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
    database: new Pool({
      connectionString:
        process.env.DATABASE_URL ?? "postgresql://titan:titan_dev_only@localhost:6432/titan_dev",
    }),
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
        sendMagicLink: async ({ email, url }) => {
          // TODO(Fase 2): plugar provedor transacional (Resend/SES/Postmark) — nunca SMTP da
          // VPS (seção 4.4.4 do prompt único). Placeholder até o pacote de e-mail existir.
          console.log(`[auth] magic link para ${email}: ${url}`);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
