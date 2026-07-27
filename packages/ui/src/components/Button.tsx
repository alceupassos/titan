// Botões — DESIGN.md §5. Primary reservado para a ação principal (nunca mais de um por
// agrupamento); Ghost para ação secundária, densidade sem ruído.
import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "ghost";
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-accent text-accent-fg hover:bg-accent/90 active:bg-accent/80 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
  ghost:
    "bg-transparent text-fg-muted border border-border hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-control px-5 py-2.5 text-sm font-medium transition-colors duration-100 ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}
