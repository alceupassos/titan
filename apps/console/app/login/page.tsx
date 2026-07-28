// Login real (Better Auth email+senha) — substitui o placeholder da Fase 1, Passo 3c. Fluxo:
// sign-in -> se a conta pertence a exatamente uma organização (tenant), ativa essa organização
// (session.activeOrganizationId, exigido por requireStaffSession()/requireOwnerSession()) antes
// de redirecionar. Sem seletor de organização ainda (dívida conhecida — sessão sempre resolve
// para o único tenant do preview).
"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const signInRes = await fetch("/api/auth/sign-in/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!signInRes.ok) {
        const body = await signInRes.json().catch(() => null);
        throw new Error(body?.message ?? "Credenciais inválidas.");
      }

      // Ativa a organização (tenant) da conta — sem isto, toda Server Action do cockpit recusa
      // com NoActiveTenantError mesmo com sessão válida (ver lib/auth/session.ts).
      const orgListRes = await fetch("/api/auth/organization/list", {
        credentials: "include",
      });
      const organizations: Array<{ id: string }> = orgListRes.ok ? await orgListRes.json() : [];
      const firstOrganization = organizations[0];

      if (firstOrganization) {
        await fetch("/api/auth/organization/set-active", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ organizationId: firstOrganization.id }),
        });
      }

      router.push(from);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao entrar.");
      setPending(false);
    }
  }

  return (
    <main className="flex h-dvh w-full items-center justify-center bg-bg p-6 text-fg">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8">
        <h1 className="text-center text-[clamp(1.5rem,2vw,2rem)] font-semibold leading-[1.1] tracking-[-0.01em]">
          Titan Stay
        </h1>
        <p className="mt-2 text-center text-sm text-fg-muted">Faça login para continuar.</p>

        <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-[0.8125rem] font-medium tracking-[0.01em] text-fg-muted">
              E-mail
            </span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-[0.75rem] border border-border bg-bg px-3 py-2 text-[0.9375rem] text-fg outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-left">
            <span className="text-[0.8125rem] font-medium tracking-[0.01em] text-fg-muted">
              Senha
            </span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-[0.75rem] border border-border bg-bg px-3 py-2 text-[0.9375rem] text-fg outline-none focus:border-accent"
            />
          </label>

          {error ? <p className="text-sm text-negative">{error}</p> : null}

          <button
            type="submit"
            disabled={pending}
            className="mt-2 rounded-[0.75rem] bg-accent px-5 py-2.5 text-[0.9375rem] font-medium text-accent-fg disabled:opacity-60"
          >
            {pending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
