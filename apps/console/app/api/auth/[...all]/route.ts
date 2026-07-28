// Monta a API HTTP real do Better Auth (sign-in, sign-up, session, organization, 2FA, passkey,
// magic-link) — sem este handler, nenhum endpoint /api/auth/* existe e nenhum login funciona,
// mesmo com createAuth() configurado (packages/auth/src/better-auth.config.ts).
import { createAuth } from "@titan/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { POST, GET } = toNextJsHandler(createAuth());
