"use client";

// Command Palette (⌘K) — acelerador para quem já conhece as rotas (DESIGN.md §5 "Navigation").
// Vive em `apps/console` (não em `packages/ui`) porque depende de `next/navigation` (`useRouter`)
// para navegação client-side real; `cmdk` em si é agnóstico de framework, mas o gatilho de
// navegação só faz sentido dentro do app Next. Fica montado uma única vez no root layout, então
// funciona tanto no cockpit (`(staff)`) quanto no portal do proprietário (`(owner)`).
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "cmdk";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { SidebarSection } from "@titan/ui";

export interface CommandPaletteProps {
  sections: SidebarSection[];
}

export function CommandPalette({ sections }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      label="Paleta de comando — navegação do cockpit"
      overlayClassName="fixed inset-0 z-50 bg-black/60"
      contentClassName="fixed left-1/2 top-24 z-50 w-full max-w-lg -translate-x-1/2"
      className="overflow-hidden rounded-card border border-border bg-surface shadow-[0_16px_48px_oklch(0_0_0_/_40%)]"
    >
      <CommandInput
        autoFocus
        placeholder="Ir para uma rota do cockpit…"
        className="w-full border-b border-border bg-transparent px-4 py-3 text-sm text-fg outline-none placeholder:text-fg-muted"
      />
      <CommandList className="max-h-80 overflow-y-auto p-2">
        <CommandEmpty className="px-3 py-6 text-center text-sm text-fg-muted">
          Nenhuma rota encontrada.
        </CommandEmpty>
        {sections.map((section) => (
          <CommandGroup key={section.title} heading={section.title} className="px-1 py-1.5">
            {section.items.map((item) => (
              <CommandItem
                key={item.href}
                value={`${section.title} ${item.label} ${item.href}`}
                onSelect={() => navigate(item.href)}
                className="cursor-pointer rounded-control px-3 py-2 text-sm text-fg data-[selected=true]:bg-surface-2"
              >
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
