// Sparkline — preenche o slot `KpiCard.sparkline` documentado desde a Fase 1 (DESIGN.md §5:
// "sparkline de ~12 pontos com gradiente sutil ao fundo") e nunca implementado até aqui. SVG
// puro (~linha + `linearGradient`), zero dependência — mesmo espírito zero-lib do `TapeChart`
// (ADR-0018), só que SVG em vez de canvas, porque aqui não há necessidade de redraw por frame
// nem de interação de arraste.
//
// `forecastPoints` (opcional) continua a série a partir do último ponto real com traço
// tracejado — DESIGN.md: "hachura só é permitida em série 'previsto' ou 'período anterior',
// nunca em série de valor real". A área de gradiente só cobre a parte REAL da série; o trecho
// previsto nunca ganha preenchimento, só a linha tracejada.
import { useId } from "react";

export type SparklineVariant = "positive" | "negative" | "info";

export interface SparklineProps {
  /** Série de valores reais, em ordem cronológica — mínimo 2 pontos para desenhar uma linha. */
  points: readonly number[];
  /** Continuação da série (ex.: forecast) — desenhada tracejada, nunca preenchida. */
  forecastPoints?: readonly number[];
  variant?: SparklineVariant;
  width?: number;
  height?: number;
}

const VARIANT_STROKE: Record<SparklineVariant, string> = {
  positive: "stroke-positive",
  negative: "stroke-negative",
  info: "stroke-info",
};

const VARIANT_GRADIENT_STOP: Record<SparklineVariant, string> = {
  positive: "var(--color-positive)",
  negative: "var(--color-negative)",
  info: "var(--color-info)",
};

function toPath(values: readonly number[], scaleX: (index: number) => number, scaleY: (value: number) => number): string {
  return values.map((value, index) => `${index === 0 ? "M" : "L"}${scaleX(index).toFixed(2)},${scaleY(value).toFixed(2)}`).join(" ");
}

export function Sparkline({ points, forecastPoints = [], variant = "info", width = 100, height = 32 }: SparklineProps) {
  const gradientId = useId();

  if (points.length < 2) {
    return null;
  }

  const allValues = [...points, ...forecastPoints];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const totalCount = points.length + forecastPoints.length;
  const stepX = width / (totalCount - 1);
  const padY = height * 0.12;

  const scaleX = (index: number) => index * stepX;
  const scaleY = (value: number) => height - padY - ((value - min) / range) * (height - padY * 2);

  const linePath = toPath(points, scaleX, scaleY);
  const areaPath = `${linePath} L${scaleX(points.length - 1).toFixed(2)},${height} L0,${height} Z`;

  const forecastPath =
    forecastPoints.length > 0
      ? toPath(
          [points[points.length - 1] as number, ...forecastPoints],
          (index) => scaleX(points.length - 1 + index),
          scaleY,
        )
      : null;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={VARIANT_GRADIENT_STOP[variant]} stopOpacity={0.28} />
          <stop offset="100%" stopColor={VARIANT_GRADIENT_STOP[variant]} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
      <path d={linePath} className={VARIANT_STROKE[variant]} fill="none" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {forecastPath ? (
        <path
          d={forecastPath}
          className={VARIANT_STROKE[variant]}
          fill="none"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeDasharray="3 3"
          opacity={0.6}
        />
      ) : null}
    </svg>
  );
}
