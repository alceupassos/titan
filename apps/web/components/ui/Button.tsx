// Botões do storefront — DESIGN.md §5. Componente próprio (não reusa @titan/ui/Button, que é do
// registro `product`/cockpit) — mesmo raio de controle (0.75rem) por ser "acabamento Titan", mas
// paleta e peso de padding próprios deste registro.
import type { ButtonHTMLAttributes } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-accent text-accent-fg hover:brightness-95 active:brightness-90 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
  secondary:
    "bg-surface-2 text-ink hover:bg-border/40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2",
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`rounded-control px-6 py-3 text-sm font-medium transition-[filter,background-color] duration-100 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}
