// Alternância de densidade — compacto (--row-compact, 40px) é o padrão do cockpit; confortável
// (--row-comfortable, 56px) é a alternativa para quem prefere linhas mais espaçadas em turnos
// longos (DESIGN.md §5 "Navigation"). Persistência (localStorage vs. cookie) é decisão do
// consumidor — este componente só reporta a mudança via `onChange`.
export type Density = "compact" | "comfortable";

export interface DensityToggleProps {
  density: Density;
  onChange: (density: Density) => void;
}

export function DensityToggle({ density, onChange }: DensityToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Densidade da navegação e das tabelas"
      className="flex items-center gap-1 rounded-control bg-surface-2 p-1"
    >
      {(
        [
          { value: "compact", label: "Compacto" },
          { value: "comfortable", label: "Confortável" },
        ] as const
      ).map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={density === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-control px-2.5 py-1 text-xs font-medium transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 ${
            density === option.value ? "bg-accent text-accent-fg" : "text-fg-muted hover:text-fg"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
