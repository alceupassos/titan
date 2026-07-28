// Placeholder de login — fora dos grupos (staff)/(owner), sem AppShell/sidebar. Escopo desta
// tarefa é só o redirect real do proxy (ver ../../proxy.ts); a tela de login completa (Better
// Auth: e-mail/senha, magic link, passkey, 2FA) é trabalho de faixa própria, ainda não desta fase.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;

  return (
    <main className="flex h-dvh w-full items-center justify-center bg-bg p-6 text-fg">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-8 text-center">
        <h1 className="text-[clamp(1.5rem,2vw,2rem)] font-semibold leading-[1.1] tracking-[-0.01em]">
          Titan Stay
        </h1>
        <p className="mt-2 text-sm text-fg-muted">
          Faça login para continuar.
          {from ? (
            <>
              {" "}
              Você será levado de volta para <span className="tabular-figures text-fg">{from}</span>.
            </>
          ) : null}
        </p>
        <p className="mt-6 text-xs text-fg-muted">
          Tela de login completa ainda não implementada nesta fase — só o redirect real do proxy
          (Better Auth) está ativo.
        </p>
      </div>
    </main>
  );
}
