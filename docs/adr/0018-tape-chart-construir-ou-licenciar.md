# ADR-0018 — Tape chart: construir em canvas ou licenciar

**Status:** Aceito, parcialmente implementado (Fase 1, Passo 4) — uma variante única (canvas 2D
direto) construída e integrada em `apps/console/app/(staff)/calendario`; a comparação formal de
2-3 variantes prevista na Decisão original **não foi feita** e fica registrada como pendência
explícita (ver "Decisão da Fase 1" abaixo). Depende da pergunta 14 (recomendação padrão) de
`docs/decisoes-de-negocio.md` só para a reavaliação comercial, que segue não acionada.

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

## Decisão da Fase 1

Por decisão explícita do usuário, o Passo 4 da Fase 1 **não** gerou as 2-3 variantes comparativas
previstas na Decisão original. Construiu-se diretamente UMA variante sólida — canvas 2D puro
(`CanvasRenderingContext2D`), sem `react-konva` e sem `glide-data-grid` — em
`packages/ui/src/components/TapeChart.tsx`, integrada com dados de amostra em
`apps/console/app/(staff)/calendario/page.tsx`. A comparação completa das alternativas continua
como pendência aberta deste ADR, não fechada por esta rodada; se o custo de manutenção do canvas
próprio estourar a estimativa separada de F1, a reavaliação comercial (Bryntum, FullCalendar
Premium) é o próximo passo, não uma segunda tentativa de construir.

Pontos da implementação relevantes para quem for revisar ou estender:

- **Virtualização**: paginação de dias (sem scroll horizontal — janela de ~30 dias por vez, com
  "Anterior"/"Próximo") + virtualização vertical real de linhas de unidade via container com
  scroll e um único `<canvas>` redesenhado a cada evento de scroll (não são desenhadas todas as
  unidades × todos os dias do ano de uma vez).
- **Cor por canal**: 5 tokens novos em `packages/ui/src/styles/theme.css`
  (`--color-channel-direct/airbnb/booking/vrbo/expedia`), OKLCH desaturados, com legenda cor+texto
  (nunca cor isolada) — tratado como codificação categórica de dado, exceção documentada à regra
  de "um único acento" (DESIGN.md §2), nunca reaproveitado fora do tape chart.
- **Arraste (`@dnd-kit/core`)**: como o elemento visual é um único `<canvas>` (não um nó DOM por
  reserva), a integração não segue o uso padrão do dnd-kit (arrastar elementos DOM individuais).
  A decisão tomada: um overlay transparente sobre o canvas carrega os listeners de um único
  `useDraggable` — dnd-kit entra SÓ como sensor/detector de arraste (`PointerSensor` com
  `activationConstraint.distance`), decidindo apenas "isto já passou do limiar e é um arraste de
  verdade" e fornecendo o delta acumulado. Toda a tradução de coordenadas de pixel para (unidade,
  data) — incluindo o hit-test de qual reserva foi tocada, o cálculo do intervalo ao criar uma
  reserva nova arrastando sobre célula vazia, e o redesenho da prévia tracejada — é lógica própria,
  resolvida a partir de eventos de ponteiro nativos, não do modelo de drag-and-drop de DOM do
  dnd-kit. Sem persistência: os callbacks `onReservationMove`/`onReservationCreate` só atualizam
  estado local da página nesta fase; a Server Action real de criar/mover reserva é o Passo 5.
