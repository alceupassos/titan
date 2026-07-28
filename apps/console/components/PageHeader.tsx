// Cabeçalho de página — tipografia Display de DESIGN.md §3 ("título de página, nunca headline de
// marketing"). Compartilhado por todas as rotas placeholder desta fase; sem estado, sem cliente.
export interface PageHeaderProps {
  title: string;
  description?: string;
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-[clamp(1.5rem,2vw,2rem)] font-semibold leading-[1.1] tracking-[-0.01em] text-fg">
        {title}
      </h1>
      {description ? <p className="mt-1 text-sm text-fg-muted">{description}</p> : null}
    </div>
  );
}
