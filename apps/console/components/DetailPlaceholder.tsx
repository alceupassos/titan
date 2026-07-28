// Placeholder de rota de detalhe dinâmica ([id]/[taskId]) — nenhuma lógica de negócio, nenhuma
// query; só prova que o segmento dinâmico chega até a página (Passo 3c, Fase 1).
export interface DetailPlaceholderProps {
  kind: string;
  id: string;
}

export function DetailPlaceholder({ kind, id }: DetailPlaceholderProps) {
  return (
    <div className="rounded-card border border-border bg-surface p-8 text-sm text-fg-muted">
      detalhe de {kind} <span className="tabular-figures text-fg">{id}</span> — ainda não
      implementado nesta fase.
    </div>
  );
}
