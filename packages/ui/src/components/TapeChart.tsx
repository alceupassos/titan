// Tape chart multi-unidade × dia (ADR-0018) — grade renderizada em <canvas> 2D direto, sem
// biblioteca de canvas de terceiro (react-konva/glide-data-grid ficaram fora desta rodada, ver
// "Decisão da Fase 1" no próprio ADR). Esta é a variante única construída na Fase 1; a
// comparação de 2-3 variantes do ADR original fica registrada como pendência, não repetida aqui.
//
// ── Decisão de integração @dnd-kit/core + canvas (documentada aqui por exigência da tarefa) ──
// dnd-kit foi desenhado para arrastar elementos DOM individuais; aqui existe UM único elemento
// visual (o <canvas>), então a integração "de livro" não se aplica. A escolha desta implementação
// foi a segunda alternativa cogitada no plano aprovado: a lógica de arraste (o que está sendo
// arrastado, para onde, e o que isso significa em termos de unidade/data) é toda nossa, resolvida
// a partir de eventos de ponteiro nativos sobre um overlay transparente posicionado exatamente
// sobre o canvas. @dnd-kit/core entra SÓ pelo `PointerSensor` + `DndContext`, cuja única
// responsabilidade aqui é decidir "isto já é um arraste de verdade (passou do threshold de
// ativação) ou só um clique" e fornecer o delta acumulado de movimento — não reinventamos essa
// heurística de ativação à mão. Ou seja: coordenadas e semântica de domínio são 100% nossas;
// detecção de arraste/threshold é 100% do dnd-kit.
"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { format as formatMoney, type Money } from "@titan/money";

export type TapeChartChannel = "direct" | "airbnb" | "booking" | "vrbo" | "expedia";
export type TapeChartReservationStatus = "pending" | "confirmed" | "cancelled" | "no_show";

export interface TapeChartUnit {
  readonly id: string;
  readonly name: string;
}

/** Shape simplificado, inspirado em `Reservation` de `@titan/domain` — sem depender do pacote
 * diretamente (evita acoplar `packages/ui` a `packages/domain` por causa de um componente de
 * apresentação; a tradução de/para o tipo real do domínio é responsabilidade de quem consome). */
export interface TapeChartReservation {
  readonly id: string;
  readonly unitId: string;
  /** Data civil "YYYY-MM-DD" — check-in, inclusivo. */
  readonly checkinISO: string;
  /** Data civil "YYYY-MM-DD" — check-out, EXCLUSIVO (mesma semântica do `daterange` do banco). */
  readonly checkoutISO: string;
  readonly status: TapeChartReservationStatus;
  readonly channel: TapeChartChannel;
  /** `@titan/money` — inteiro em centavos + moeda, nunca `number` solto (docs/anti-padroes.md #9). */
  readonly price: Money;
}

export interface TapeChartMoveEvent {
  reservationId: string;
  targetUnitId: string;
  newCheckinISO: string;
  newCheckoutISO: string;
}

export interface TapeChartCreateEvent {
  unitId: string;
  checkinISO: string;
  checkoutISO: string;
}

export interface TapeChartProps {
  units: readonly TapeChartUnit[];
  reservations: readonly TapeChartReservation[];
  /** Primeiro dia da janela visível. Default: hoje (UTC). */
  initialWindowStartISO?: string;
  /** Quantos dias ficam visíveis de uma vez — paginação, não scroll horizontal. Default 30. */
  daysPerPage?: number;
  /** Altura de linha em px — reusar o estado de `DensityToggle` do consumidor (40 compacto / 56
   * confortável) ou passar um valor fixo. Default 40. */
  rowHeight?: number;
  /** Altura em px da área de scroll vertical (virtualização de linhas). Default 480. */
  viewportHeight?: number;
  onReservationMove?: (event: TapeChartMoveEvent) => void;
  onReservationCreate?: (event: TapeChartCreateEvent) => void;
}

const UNIT_COLUMN_WIDTH = 176;
const HEADER_HEIGHT = 36;
const MIN_DAY_COLUMN_WIDTH = 26;
const BAR_VERTICAL_PADDING = 6;
const DEFAULT_DAYS_PER_PAGE = 30;
const DEFAULT_VIEWPORT_HEIGHT = 480;
const DEFAULT_ROW_HEIGHT = 40;

const CHANNEL_LABEL: Record<TapeChartChannel, string> = {
  direct: "Direto",
  airbnb: "Airbnb",
  booking: "Booking",
  vrbo: "Vrbo",
  expedia: "Expedia",
};

// Nomes de classe LITERAIS (não gerados por template string em runtime) — o scanner de conteúdo
// do Tailwind v4 precisa encontrar o texto completo da classe em algum lugar do arquivo-fonte
// para gerar a utility a partir do token `--color-channel-*` de theme.css.
const CHANNEL_LEGEND_SWATCH_CLASS: Record<TapeChartChannel, string> = {
  direct: "bg-channel-direct",
  airbnb: "bg-channel-airbnb",
  booking: "bg-channel-booking",
  vrbo: "bg-channel-vrbo",
  expedia: "bg-channel-expedia",
};

const STATUS_LABEL: Record<TapeChartReservationStatus, string> = {
  pending: "pendente",
  confirmed: "confirmada",
  cancelled: "cancelada",
  no_show: "no-show",
};

// Opacidade por status — nunca hachura em série de valor real (DESIGN.md §6 "Don't"); a
// diferenciação de status vem de opacidade + o texto do tooltip, nunca só da cor do canal.
const STATUS_OPACITY: Record<TapeChartReservationStatus, number> = {
  confirmed: 1,
  pending: 0.62,
  cancelled: 0.26,
  no_show: 0.26,
};

const MS_PER_DAY = 86_400_000;

function toUTCDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDaysISO(fromISO: string, toISO: string): number {
  return Math.round((toUTCDate(toISO).getTime() - toUTCDate(fromISO).getTime()) / MS_PER_DAY);
}

function formatDayHeader(iso: string): { weekday: string; day: string } {
  const d = toUTCDate(iso);
  const weekday = d
    .toLocaleDateString("pt-BR", { weekday: "short", timeZone: "UTC" })
    .replace(".", "")
    .toUpperCase();
  return { weekday, day: String(d.getUTCDate()).padStart(2, "0") };
}

function formatWindowRangeLabel(startISO: string, daysPerPage: number): string {
  const endISO = addDaysISO(startISO, daysPerPage - 1);
  const start = toUTCDate(startISO).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  const end = toUTCDate(endISO).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${start} – ${end}`;
}

function isWeekendISO(iso: string): boolean {
  const day = toUTCDate(iso).getUTCDay();
  return day === 0 || day === 6;
}

/** Lê um token de cor de `theme.css` direto do elemento — mantém a paleta com fonte única de
 * verdade (o CSS), em vez de duplicar valores oklch() hardcoded aqui. */
function cssVar(el: Element, name: string, fallback: string): string {
  const value = getComputedStyle(el).getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

interface DragOrigin {
  readonly pointerClientX: number;
  readonly pointerClientY: number;
  readonly unitIndex: number;
  readonly dayIndex: number;
  /** `null` quando o arraste começou numa célula vazia — vira criação, não movimento. */
  readonly reservation: TapeChartReservation | null;
}

interface DragPreview {
  readonly kind: "move" | "create";
  readonly unitIndex: number;
  readonly checkinISO: string;
  readonly checkoutISO: string;
  readonly reservationId?: string;
}

interface HoverInfo {
  readonly clientX: number;
  readonly clientY: number;
  readonly reservation: TapeChartReservation;
}

const DRAG_SURFACE_ID = "tape-chart-drag-surface";

export function TapeChart({
  units,
  reservations,
  initialWindowStartISO,
  daysPerPage = DEFAULT_DAYS_PER_PAGE,
  rowHeight = DEFAULT_ROW_HEIGHT,
  viewportHeight = DEFAULT_VIEWPORT_HEIGHT,
  onReservationMove,
  onReservationCreate,
}: TapeChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [windowStartISO, setWindowStartISO] = useState(initialWindowStartISO ?? todayISO());
  const [containerWidth, setContainerWidth] = useState(0);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Refs (não estado) para dados lidos a cada frame de arraste/scroll — evita re-render do React
  // a cada pixel de movimento; o redraw do canvas é chamado imperativamente.
  const scrollTopRef = useRef(0);
  const dragOriginRef = useRef<DragOrigin | null>(null);
  const dragPreviewRef = useRef<DragPreview | null>(null);

  const dayColumnWidth = Math.max(
    MIN_DAY_COLUMN_WIDTH,
    Math.floor((containerWidth - UNIT_COLUMN_WIDTH) / daysPerPage) || MIN_DAY_COLUMN_WIDTH,
  );

  const reservationsByUnit = useMemo(() => {
    const map = new Map<string, TapeChartReservation[]>();
    for (const reservation of reservations) {
      const list = map.get(reservation.unitId);
      if (list) {
        list.push(reservation);
      } else {
        map.set(reservation.unitId, [reservation]);
      }
    }
    return map;
  }, [reservations]);

  const visibleUnitCount = Math.max(1, Math.ceil(viewportHeight / rowHeight) + 1);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const cssWidth = containerWidth || UNIT_COLUMN_WIDTH + daysPerPage * MIN_DAY_COLUMN_WIDTH;
    const cssHeight = viewportHeight;
    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bg = cssVar(canvas, "--color-bg", "#282c34");
    const surface = cssVar(canvas, "--color-surface", "#333846");
    const surface2 = cssVar(canvas, "--color-surface-2", "#3d4353");
    const border = cssVar(canvas, "--color-border", "rgba(255,255,255,0.08)");
    const fg = cssVar(canvas, "--color-fg", "#f5f6f8");
    const fgMuted = cssVar(canvas, "--color-fg-muted", "#a8adba");
    const info = cssVar(canvas, "--color-info", "#7fa8e0");

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    const scrollTop = scrollTopRef.current;
    const firstUnitIndex = Math.floor(scrollTop / rowHeight);
    const rowOffset = scrollTop - firstUnitIndex * rowHeight;

    // ── Linhas de unidade (zebra) + reservas ──
    for (let visibleRow = 0; visibleRow < visibleUnitCount; visibleRow++) {
      const unitIndex = firstUnitIndex + visibleRow;
      const unit = units[unitIndex];
      if (!unit) continue;

      const rowTop = HEADER_HEIGHT + visibleRow * rowHeight - rowOffset;
      if (rowTop > cssHeight || rowTop + rowHeight < HEADER_HEIGHT) continue;

      ctx.fillStyle = unitIndex % 2 === 0 ? surface : bg;
      ctx.fillRect(0, rowTop, cssWidth, rowHeight);

      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(0, rowTop + rowHeight);
      ctx.lineTo(cssWidth, rowTop + rowHeight);
      ctx.stroke();

      ctx.fillStyle = fg;
      ctx.font = "500 12.5px Geist, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(unit.name, 12, rowTop + rowHeight / 2, UNIT_COLUMN_WIDTH - 20);

      const unitReservations = reservationsByUnit.get(unit.id) ?? [];
      for (const reservation of unitReservations) {
        const startDayIndex = diffDaysISO(windowStartISO, reservation.checkinISO);
        const endDayIndex = diffDaysISO(windowStartISO, reservation.checkoutISO);
        if (endDayIndex <= 0 || startDayIndex >= daysPerPage) continue; // fora da janela visível

        const clampedStart = Math.max(0, startDayIndex);
        const clampedEnd = Math.min(daysPerPage, endDayIndex);
        const barX = UNIT_COLUMN_WIDTH + clampedStart * dayColumnWidth;
        const barWidth = Math.max(2, (clampedEnd - clampedStart) * dayColumnWidth - 2);
        const barY = rowTop + BAR_VERTICAL_PADDING;
        const barHeight = rowHeight - BAR_VERTICAL_PADDING * 2;

        const channelColor = cssVar(canvas, `--color-channel-${reservation.channel}`, fgMuted);
        ctx.globalAlpha = STATUS_OPACITY[reservation.status];
        ctx.fillStyle = channelColor;
        drawRoundedRect(ctx, barX, barY, barWidth, barHeight, Math.min(6, barHeight / 2));
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    // ── Coluna de unidade — fundo sólido por cima da grade para ela nunca ficar "atrás" da barra ──
    ctx.fillStyle = surface;
    ctx.fillRect(0, HEADER_HEIGHT, UNIT_COLUMN_WIDTH, cssHeight - HEADER_HEIGHT);
    for (let visibleRow = 0; visibleRow < visibleUnitCount; visibleRow++) {
      const unitIndex = firstUnitIndex + visibleRow;
      const unit = units[unitIndex];
      if (!unit) continue;
      const rowTop = HEADER_HEIGHT + visibleRow * rowHeight - rowOffset;
      if (rowTop > cssHeight || rowTop + rowHeight < HEADER_HEIGHT) continue;
      ctx.fillStyle = fg;
      ctx.font = "500 12.5px Geist, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(unit.name, 12, rowTop + rowHeight / 2, UNIT_COLUMN_WIDTH - 20);
    }
    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.moveTo(UNIT_COLUMN_WIDTH, 0);
    ctx.lineTo(UNIT_COLUMN_WIDTH, cssHeight);
    ctx.stroke();

    // ── Linhas verticais de dia + cabeçalho ──
    ctx.fillStyle = surface2;
    ctx.fillRect(0, 0, cssWidth, HEADER_HEIGHT);
    for (let dayIndex = 0; dayIndex < daysPerPage; dayIndex++) {
      const dayISO = addDaysISO(windowStartISO, dayIndex);
      const x = UNIT_COLUMN_WIDTH + dayIndex * dayColumnWidth;

      if (isWeekendISO(dayISO)) {
        ctx.fillStyle = "rgba(255,255,255,0.02)";
        ctx.fillRect(x, HEADER_HEIGHT, dayColumnWidth, cssHeight - HEADER_HEIGHT);
      }

      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssHeight);
      ctx.stroke();

      const { weekday, day } = formatDayHeader(dayISO);
      ctx.fillStyle = fgMuted;
      ctx.font = "500 9.5px Geist, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(weekday, x + dayColumnWidth / 2, 4, dayColumnWidth - 2);
      ctx.fillStyle = fg;
      ctx.font = "600 12px Geist, system-ui, sans-serif";
      ctx.fillText(day, x + dayColumnWidth / 2, 16, dayColumnWidth - 2);
      ctx.textAlign = "left";
    }
    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.moveTo(0, HEADER_HEIGHT);
    ctx.lineTo(cssWidth, HEADER_HEIGHT);
    ctx.stroke();

    // ── Prévia de arraste (criação ou movimento) — contorno tracejado em `info`, nunca no verde
    // de acento (reservado a status positivo/CTA/nav ativo — DESIGN.md, "The One Voice Rule"). ──
    const preview = dragPreviewRef.current;
    if (preview) {
      const previewRowIndex = preview.unitIndex - firstUnitIndex;
      const rowTop = HEADER_HEIGHT + previewRowIndex * rowHeight - rowOffset;
      const startDayIndex = diffDaysISO(windowStartISO, preview.checkinISO);
      const endDayIndex = diffDaysISO(windowStartISO, preview.checkoutISO);
      const barX = UNIT_COLUMN_WIDTH + Math.max(0, startDayIndex) * dayColumnWidth;
      const barWidth = Math.max(2, (Math.min(daysPerPage, endDayIndex) - Math.max(0, startDayIndex)) * dayColumnWidth - 2);
      const barY = rowTop + BAR_VERTICAL_PADDING;
      const barHeight = rowHeight - BAR_VERTICAL_PADDING * 2;

      ctx.save();
      ctx.strokeStyle = info;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      drawRoundedRect(ctx, barX, barY, barWidth, barHeight, Math.min(6, barHeight / 2));
      ctx.stroke();
      ctx.restore();
    }
  }, [containerWidth, daysPerPage, dayColumnWidth, reservationsByUnit, rowHeight, units, viewportHeight, windowStartISO, visibleUnitCount]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Largura do container via ResizeObserver — o canvas não tem scroll horizontal (paginação por
  // dias cobre isso), só precisa saber a largura disponível para calcular `dayColumnWidth`.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollTopRef.current = el.scrollTop;
    requestAnimationFrame(draw);
  }, [draw]);

  /** Converte coordenadas de cliente (px na tela) em (índice de unidade visível, índice de dia
   * dentro da janela atual) — usada tanto no hit-test do pointerdown quanto no hover/drag. */
  const pointToCell = useCallback(
    (clientX: number, clientY: number): { unitIndex: number; dayIndex: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      if (x < UNIT_COLUMN_WIDTH || y < HEADER_HEIGHT) return null;

      const scrollTop = scrollTopRef.current;
      const firstUnitIndex = Math.floor(scrollTop / rowHeight);
      const rowOffset = scrollTop - firstUnitIndex * rowHeight;
      const rowInViewport = Math.floor((y - HEADER_HEIGHT + rowOffset) / rowHeight);
      const unitIndex = firstUnitIndex + rowInViewport;
      const dayIndex = Math.floor((x - UNIT_COLUMN_WIDTH) / dayColumnWidth);
      if (unitIndex < 0 || unitIndex >= units.length || dayIndex < 0 || dayIndex >= daysPerPage) {
        return null;
      }
      return { unitIndex, dayIndex };
    },
    [dayColumnWidth, daysPerPage, rowHeight, units.length],
  );

  const findReservationAt = useCallback(
    (unitIndex: number, dayIndex: number): TapeChartReservation | null => {
      const unit = units[unitIndex];
      if (!unit) return null;
      const dateISO = addDaysISO(windowStartISO, dayIndex);
      const candidates = reservationsByUnit.get(unit.id) ?? [];
      return (
        candidates.find(
          (r) => r.checkinISO <= dateISO && dateISO < r.checkoutISO,
        ) ?? null
      );
    },
    [reservationsByUnit, units, windowStartISO],
  );

  const handleSurfacePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const cell = pointToCell(event.clientX, event.clientY);
      if (!cell) {
        dragOriginRef.current = null;
        return;
      }
      const reservation = findReservationAt(cell.unitIndex, cell.dayIndex);
      dragOriginRef.current = {
        pointerClientX: event.clientX,
        pointerClientY: event.clientY,
        unitIndex: cell.unitIndex,
        dayIndex: cell.dayIndex,
        reservation,
      };
    },
    [findReservationAt, pointToCell],
  );

  const handleSurfacePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (dragOriginRef.current) return; // durante arraste, o DndContext cuida do redesenho
      const cell = pointToCell(event.clientX, event.clientY);
      if (!cell) {
        if (hover) setHover(null);
        return;
      }
      const reservation = findReservationAt(cell.unitIndex, cell.dayIndex);
      if (reservation) {
        setHover({ clientX: event.clientX, clientY: event.clientY, reservation });
      } else if (hover) {
        setHover(null);
      }
    },
    [findReservationAt, hover, pointToCell],
  );

  const handleSurfacePointerLeave = useCallback(() => {
    setHover(null);
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDragStart = useCallback((_event: DragStartEvent) => {
    const origin = dragOriginRef.current;
    if (!origin) return;
    if (origin.reservation) {
      dragPreviewRef.current = {
        kind: "move",
        unitIndex: origin.unitIndex,
        checkinISO: origin.reservation.checkinISO,
        checkoutISO: origin.reservation.checkoutISO,
        reservationId: origin.reservation.id,
      };
    } else {
      const dateISO = addDaysISO(windowStartISO, origin.dayIndex);
      dragPreviewRef.current = {
        kind: "create",
        unitIndex: origin.unitIndex,
        checkinISO: dateISO,
        checkoutISO: addDaysISO(dateISO, 1),
      };
    }
    requestAnimationFrame(draw);
  }, [draw, windowStartISO]);

  const handleDragMove = useCallback(
    (event: DragMoveEvent) => {
      const origin = dragOriginRef.current;
      if (!origin) return;
      const currentClientX = origin.pointerClientX + event.delta.x;
      const currentClientY = origin.pointerClientY + event.delta.y;
      const cell = pointToCell(currentClientX, currentClientY);
      if (!cell) return;

      if (origin.reservation) {
        const dayShift = cell.dayIndex - origin.dayIndex;
        dragPreviewRef.current = {
          kind: "move",
          unitIndex: cell.unitIndex,
          checkinISO: addDaysISO(origin.reservation.checkinISO, dayShift),
          checkoutISO: addDaysISO(origin.reservation.checkoutISO, dayShift),
          reservationId: origin.reservation.id,
        };
      } else {
        // Criação: arraste horizontal dentro da MESMA linha em que começou (não muda de unidade).
        const originDateISO = addDaysISO(windowStartISO, origin.dayIndex);
        const currentDateISO = addDaysISO(windowStartISO, cell.dayIndex);
        const [minISO, maxISO] =
          originDateISO <= currentDateISO ? [originDateISO, currentDateISO] : [currentDateISO, originDateISO];
        dragPreviewRef.current = {
          kind: "create",
          unitIndex: origin.unitIndex,
          checkinISO: minISO,
          checkoutISO: addDaysISO(maxISO, 1),
        };
      }
      requestAnimationFrame(draw);
    },
    [draw, pointToCell, windowStartISO],
  );

  const handleDragEnd = useCallback(
    (_event: DragEndEvent) => {
      const preview = dragPreviewRef.current;
      const origin = dragOriginRef.current;
      if (preview && origin) {
        const targetUnit = units[preview.unitIndex];
        if (targetUnit) {
          if (preview.kind === "move" && preview.reservationId) {
            onReservationMove?.({
              reservationId: preview.reservationId,
              targetUnitId: targetUnit.id,
              newCheckinISO: preview.checkinISO,
              newCheckoutISO: preview.checkoutISO,
            });
          } else if (preview.kind === "create") {
            onReservationCreate?.({
              unitId: targetUnit.id,
              checkinISO: preview.checkinISO,
              checkoutISO: preview.checkoutISO,
            });
          }
        }
      }
      dragOriginRef.current = null;
      dragPreviewRef.current = null;
      requestAnimationFrame(draw);
    },
    [draw, onReservationCreate, onReservationMove, units],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="tabular-figures text-sm font-medium text-fg">
          {formatWindowRangeLabel(windowStartISO, daysPerPage)}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWindowStartISO((prev) => addDaysISO(prev, -daysPerPage))}
            className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => setWindowStartISO((prev) => addDaysISO(prev, daysPerPage))}
            className="rounded-control border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
          >
            Próximo
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd}>
        <div className="relative overflow-hidden rounded-card border border-border">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="relative overflow-y-auto overflow-x-hidden"
            style={{ height: viewportHeight }}
          >
            {/* Spacer que dá ao container a altura de rolagem correta (units.length linhas) — o
                canvas em si só cobre a viewport, redesenhado a cada scroll (virtualização). */}
            <div style={{ height: HEADER_HEIGHT + units.length * rowHeight }} />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute left-0 top-0"
              style={{ width: containerWidth || "100%", height: viewportHeight }}
              role="img"
              aria-label="Tape chart de reservas por unidade e dia"
            />
            <DragSurface
              onPointerDownCapture={handleSurfacePointerDown}
              onPointerMove={handleSurfacePointerMove}
              onPointerLeave={handleSurfacePointerLeave}
              style={{ height: Math.min(viewportHeight, HEADER_HEIGHT + units.length * rowHeight) }}
            />
          </div>
        </div>
      </DndContext>

      {hover ? (
        <div
          className="pointer-events-none fixed z-50 rounded-control border border-border bg-surface-2 px-3 py-2 text-xs shadow-[0_16px_48px_oklch(0_0_0_/_40%)]"
          style={{ left: hover.clientX + 14, top: hover.clientY + 14 }}
        >
          <div className="font-medium text-fg">{CHANNEL_LABEL[hover.reservation.channel]}</div>
          <div className="mt-0.5 text-fg-muted">
            {hover.reservation.checkinISO} → {hover.reservation.checkoutISO} · {STATUS_LABEL[hover.reservation.status]}
          </div>
          <div className="tabular-figures mt-0.5 text-fg">{formatMoney(hover.reservation.price)}</div>
        </div>
      ) : null}

      {/* Legenda de canal — cor NUNCA sozinha, sempre com texto (mesma regra do StatusPill). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {(Object.keys(CHANNEL_LABEL) as TapeChartChannel[]).map((channel) => (
          <div key={channel} className="flex items-center gap-1.5 text-xs text-fg-muted">
            <span className={`h-2.5 w-2.5 rounded-full ${CHANNEL_LEGEND_SWATCH_CLASS[channel]}`} aria-hidden="true" />
            {CHANNEL_LABEL[channel]}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Overlay transparente exatamente sobre o canvas — é ele (não o canvas) que carrega os
 * listeners do `useDraggable` do dnd-kit e nossos próprios handlers de ponteiro, ver nota de
 * decisão no topo do arquivo. */
function DragSurface({
  onPointerDownCapture,
  onPointerMove,
  onPointerLeave,
  style,
}: {
  onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
  style: React.CSSProperties;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: DRAG_SURFACE_ID });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="absolute left-0 top-0 w-full cursor-crosshair touch-none"
      style={style}
    />
  );
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}
