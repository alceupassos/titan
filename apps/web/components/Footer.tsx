// Rodapé com identidade Titan — reforça que é a mesma empresa por trás do cockpit (DESIGN.md §5).
export function Footer() {
  return (
    <footer className="border-t border-border bg-surface-2">
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-ink-muted">
        <p className="font-display text-base text-ink">Titan Stay</p>
        <p className="mt-2">Titan Empreendimentos — hospitalidade de temporada.</p>
        <p className="mt-4 text-xs">
          Reservar diretamente evita taxas de intermediação e mantém o mesmo padrão de atendimento
          que você recebe pessoalmente na estadia.
        </p>
      </div>
    </footer>
  );
}
