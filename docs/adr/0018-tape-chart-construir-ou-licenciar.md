# ADR-0018 — Tape chart: construir em canvas ou licenciar

**Status:** Proposto (Rodada 0) — depende da pergunta 14 (recomendação padrão) de
`docs/decisoes-de-negocio.md`; decisão final na Fase 1

## Contexto
Grade multi-unidade virtualizada, com arraste para criar/mover reserva e edição em massa de
tarifa/restrição. DOM puro com 500 unidades × 365 dias não sustenta scroll fluido. Não há
biblioteca gratuita adequada — FullCalendar `resource-timeline` e Bryntum Scheduler são
comerciais. A própria spec marca isso como "o maior risco de esforço de UI do projeto".

## Decisão
Construir em canvas próprio como primeira tentativa — avaliar `react-konva` vs. canvas 2D direto
vs. `glide-data-grid` — com arraste via `@dnd-kit/core`. Gerar 2-3 variantes na Fase 1 (faixa
paralela autorizada pela seção 5.11.3) e comparar antes de comprometer a Fase 8 (Pricing), que
depende do calendário funcionando. Reavaliar comercial (Bryntum, FullCalendar Premium) só se o
custo de construção estourar a estimativa separada feita para esta peça.

## Justificativa
É a peça de UI com maior incerteza de esforço; decidir cedo entre construir e licenciar sem
protótipo comparativo é decidir às cegas.

## Consequências
- Estimativa de esforço da tape chart feita separadamente do resto do orçamento de F1.
- Se a comparação apontar para comercial, o custo de licença entra como linha de custo do
  produto, não como decisão técnica isolada.
