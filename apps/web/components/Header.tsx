import Link from "next/link";

// Header claro do storefront — DESIGN.md §5 "Navigation": sem sidebar (não é o cockpit), funil
// linear curto. Logo textual nesta fase (sem asset de marca produzido ainda).
export function Header() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="font-display text-xl font-semibold text-ink">
          Titan Stay
        </Link>
        <nav className="flex items-center gap-6 text-sm text-ink-muted">
          <Link href="/unidades" className="hover:text-ink">
            Unidades
          </Link>
        </nav>
      </div>
    </header>
  );
}
