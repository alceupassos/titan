// Estado vazio de lista/tabela — companheiro do `KpiCard state="empty"` para listas que ainda não
// têm dado real nesta fase (só casca navegável, sem query nenhuma). Cor+texto, nunca só ícone
// (mesma família de regra do `StatusPill`, DESIGN.md).
export interface EmptyStateProps {
  message: string;
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="rounded-card border border-border bg-surface p-8 text-center text-sm text-fg-muted">
      {message}
    </div>
  );
}
