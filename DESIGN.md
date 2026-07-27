---
name: Titan Stay — Cockpit
description: Torre de controle densa para operação de aluguel de temporada — reservas, canais, dinheiro e evidência em uma só superfície.
colors:
  bg: "oklch(0.16 0.012 250)"
  surface: "oklch(0.21 0.014 250)"
  surface-2: "oklch(0.26 0.016 250)"
  border: "oklch(1 0 0 / 8%)"
  fg: "oklch(0.97 0.005 250)"
  fg-muted: "oklch(0.72 0.010 250)"
  accent: "oklch(0.78 0.170 155)"
  accent-fg: "oklch(0.18 0.030 155)"
  positive: "oklch(0.78 0.170 155)"
  negative: "oklch(0.65 0.200 25)"
  warning: "oklch(0.80 0.150 85)"
  info: "oklch(0.70 0.140 250)"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(1.5rem, 2vw, 2rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    letterSpacing: "0.01em"
  numeric:
    fontFamily: "Geist Mono, monospace"
    fontSize: "0.9375rem"
    fontWeight: 500
    fontFeature: "tnum"
rounded:
  card: "1.25rem"
  control: "0.75rem"
  pill: "9999px"
spacing:
  row-compact: "40px"
  row-comfortable: "56px"
  card-padding: "1.25rem"
components:
  kpi-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
    padding: "1.25rem"
  status-pill-positive:
    backgroundColor: "{colors.positive}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  status-pill-negative:
    backgroundColor: "{colors.negative}"
    textColor: "{colors.fg}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  status-pill-warning:
    backgroundColor: "{colors.warning}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.fg-muted}"
    rounded: "{rounded.control}"
    padding: "10px 20px"
---

# Design System: Titan Stay — Cockpit

## 1. Overview

**Creative North Star: "A Torre de Controle"**

O cockpit é uma torre de controle: supervisão calma e de alto risco sobre muitas partes em
movimento — reservas, canais, dinheiro, limpeza, evidência — a partir de uma única superfície
densa e legível de relance. Nada aqui é uma peça de marketing; é uma ferramenta usada oito horas
por dia por quem precisa confiar em cada número que vê. A personalidade é **profissional,
transparente, eficiente** (PRODUCT.md): confiante porque todo valor tem lastro auditável, plana
sobre o que é ação de agente versus ação de pessoa, e rápida de escanear ao longo de um turno de
20 rotas.

O sistema rejeita explicitamente três coisas que a categoria "dashboard SaaS" faz por reflexo e
que quebram uma ferramenta de uso real: glow/glassmorphism atrás de dado, barra hachurada em
série de valor real, e múltiplos gradientes saturados diferentes por conjunto de KPI cards
(ADR-0016). Também rejeita se parecer um clone barato de template Airbnb, uma planilha corporativa
fria, ou um app social de consumo (PRODUCT.md — Anti-references).

**Key Characteristics:**
- Escuro por padrão, denso (linha de 40px), com modo confortável como alternativa.
- Um único acento verde, usado com raridade — reservado a status positivo, CTA primário e estado
  ativo de navegação.
- Toda cifra e todo número de tabela em fonte mono com figuras tabulares; nunca proporcional.
- Plano em repouso; elevação só aparece como resposta a interação (hover, foco, modal).
- Ator sempre visível: rótulo de agente (`agent:concierge v1.4`) nunca se confunde com o de uma
  pessoa.

## 2. Colors

Paleta de um único acento sobre neutros frios com leve viés azulado — a cor comunica status e
variação, nunca decoração.

### Primary
- **Verde Titan** (`oklch(0.78 0.170 155)`): acento único do sistema. Usado só em: status positivo
  (badge de variação, `StatusPill` de sucesso), CTA primário, ícone/estado ativo de navegação, e
  ponto de destaque de gráfico quando o dado exige atenção. **The One Voice Rule.** Se o verde
  aparece em mais de ~10% da tela, algo saiu do escopo — a raridade é o que faz o acento
  significar algo.

### Neutral
- **Quase-preto azulado** (`oklch(0.16 0.012 250)`, `bg`): fundo base do cockpit.
- **Superfície** (`oklch(0.21 0.014 250)`, `surface`): cards, painéis, linhas de tabela.
- **Superfície elevada** (`oklch(0.26 0.016 250)`, `surface-2`): popover, dropdown, modal, hover
  de linha.
- **Borda sutil** (`oklch(1 0 0 / 8%)`, `border`): divisórias e contornos de card — nunca mais
  contrastante que isso em repouso.
- **Texto principal** (`oklch(0.97 0.005 250)`, `fg`): corpo, números, títulos.
- **Texto muted** (`oklch(0.72 0.010 250)`, `fg-muted`): rótulos pequenos de KPI card, texto
  secundário — nunca abaixo de 4,5:1 de contraste contra `bg`/`surface`.

### Named Rules
**The Status-Needs-Text Rule.** Nenhum `StatusPill` comunica estado só por cor — cor mais texto,
sempre. Daltonismo e auditoria exigem isso; é regra de acessibilidade, não de estilo (seção 5.9.2
do prompt único).

**The Semantic-Only Rule.** `positive` (`oklch(0.78 0.170 155)`, mesmo tom do acento), `negative`
(`oklch(0.65 0.200 25)`), `warning` (`oklch(0.80 0.150 85)`) e `info` (`oklch(0.70 0.140 250)`)
existem só para status e variação — nunca como decoração de card ou fundo de seção.

## 3. Typography

**Display/UI Font:** Geist (fallback: system-ui, sans-serif)
**Numeric/Mono Font:** Geist Mono (fallback: monospace) — todo valor monetário e todo número de
tabela, sem exceção

**Character:** Uma sans geométrica variável para toda a UI, pareada com uma mono de figuras
tabulares só para números — o contraste geométrico/mono é o que faz colunas de dinheiro alinharem
e o olho comparar linha a linha.

### Hierarchy
- **Display** (600, `clamp(1.5rem, 2vw, 2rem)`, 1.1): número grande do KPI card e títulos de
  página — nunca headline de marketing; este é registro de produto, não de marca.
- **Body** (400, 0.9375rem, 1.5): texto corrido, descrições, células de tabela não-numéricas.
- **Label** (500, 0.8125rem, tracking 0.01em): rótulo pequeno acima do número do KPI card,
  cabeçalho de coluna, rótulo de campo.
- **Numeric** (500, 0.9375rem, `font-variant-numeric: tabular-nums`): todo valor monetário, toda
  célula numérica de tabela, todo número de ledger — Geist Mono, nunca Geist.

### Named Rules
**The Tabular-Nums Rule.** Nenhum número financeiro ou de tabela usa a fonte sans. Sem isso,
coluna de dinheiro não alinha e a comparação visual falha — é regra funcional, não estética
(seção 5.9.1).

## 4. Elevation

Plano por padrão. **The Interaction-Only Lift Rule.** Superfícies em repouso não têm sombra —
profundidade vem de degraus de superfície (`bg` → `surface` → `surface-2`). Sombra só aparece
como resposta a estado: hover de card, foco de input, ou modal/popover saindo do fluxo do
documento. Isso é consequência direta de rejeitar glow/glassmorphism atrás de dado (ADR-0016):
qualquer profundidade decorativa em repouso compete com o número que o card existe para mostrar.

### Shadow Vocabulary
- **hover-lift** (`box-shadow: 0 4px 16px oklch(0 0 0 / 24%)`): card interativo ao passar o
  mouse — sinaliza "isto é clicável", nunca decoração de card estático.
- **modal** (`box-shadow: 0 16px 48px oklch(0 0 0 / 40%)`): modal, dialog, popover — separa do
  conteúdo de fundo sem recorrer a blur/glass.

## 5. Components

### Buttons
- **Shape:** raio de controle suave (`0.75rem`).
- **Primary:** fundo verde Titan (`accent`), texto `accent-fg` (quase-preto para contraste sobre
  o verde), padding `10px 20px` — reservado para a ação principal da tela; nunca mais de um por
  agrupamento visual.
- **Ghost:** fundo transparente, texto `fg-muted`, mesmo raio — ação secundária, densidade sem
  ruído visual.
- **Hover / Focus:** leve escurecimento do fundo no primary; anel de foco visível (`outline`) em
  `accent` a 2px para navegação por teclado, nunca suprimido.

### KPI Card (componente de assinatura)
- **Shape:** raio generoso (`1.25rem`, `radius-card`), como nas 4 imagens de referência.
- **Estrutura:** rótulo pequeno em `fg-muted` (Label) → número grande em `tabular-nums` (Numeric,
  Display) → badge de variação com seta + cor semântica + texto → sparkline de ~12 pontos com
  gradiente sutil ao fundo.
- **Regra de grade:** altura fixa, **máximo 4 por linha**.
- **Estados:** carregando (skeleton), vazio, erro, parcial — todo KPI card entrega os quatro.
- **Proibido:** gradiente saturado diferente por card (ADR-0016) — a superfície é sempre
  `surface` neutra; só o acento e a cor semântica do badge carregam cor.

### Status Pill
- **Style:** fundo semântico sólido (`positive`/`negative`/`warning`), texto sempre presente
  junto à cor — nunca cor isolada.
- **Shape:** pílula (`rounded: 9999px`), padding `2px 10px`.

### Cards / Containers
- **Corner Style:** `1.25rem` (`radius-card`).
- **Background:** `surface` em repouso; `surface-2` só em popover/dropdown/hover de linha.
- **Shadow Strategy:** nenhuma em repouso — ver seção 4 (Elevation).
- **Border:** `border` (`oklch(1 0 0 / 8%)`) sutil, nunca mais contrastante em repouso.
- **Internal Padding:** `1.25rem`.

### Navigation
- **Style:** sidebar **com rótulos** — nunca barra de ícones sem texto (vinte rotas em ícones é
  adivinhação). Estado ativo usa o acento verde no ícone/indicador, nunca preenchendo toda a
  linha.
- **Acelerador:** `cmdk` (⌘K), command palette, para quem já conhece as rotas.
- **Densidade:** linha de 40px por padrão (modo compacto); alternância para 56px (modo
  confortável) — tape chart e tabelas longas cansam a vista em modo escuro o dia inteiro.

### Agent Action Badge (componente de assinatura)
- **Style:** pequeno rótulo textual acompanhando qualquer linha de timeline/tabela tocada por
  agente — nunca só ícone. Formato `agent:<nome> v<versão>`, cor neutra (nunca o acento, para não
  confundir "ação de agente" com "status positivo").
- **Regra:** indistinguível em rastreabilidade de uma ação humana — aparece no mesmo lugar, com o
  mesmo peso visual, que o nome de uma pessoa apareceria.

## 6. Do's and Don'ts

### Do:
- **Do** usar Geist Mono com `font-variant-numeric: tabular-nums` em todo valor monetário e toda
  célula numérica de tabela, sem exceção.
- **Do** manter o verde Titan (`oklch(0.78 0.170 155)`) raro — status positivo, CTA primário,
  nav ativo — nunca decoração de superfície ampla.
- **Do** parear cor semântica com texto em todo `StatusPill`; cor sozinha não comunica estado.
- **Do** manter KPI cards planos em repouso, com elevação só no hover.
- **Do** limitar a 4 KPI cards por linha, cada um com os quatro estados (loading/empty/error/
  partial).
- **Do** rotular toda ação de agente com `agent:<nome> v<versão>`, visível no mesmo lugar que uma
  ação humana apareceria.
- **Do** usar sidebar com rótulos de texto, nunca só ícones, para as ~20 rotas do cockpit.

### Don't:
- **Don't** usar glow ou glassmorphism atrás de número, tabela ou texto — decorativo em elemento
  isolado é aceitável; atrás de dado, nunca (ADR-0016).
- **Don't** usar barra hachurada em série de valor real — hachura só é permitida em série
  "previsto" ou "período anterior".
- **Don't** usar mais de um gradiente saturado por conjunto de KPI cards — a cor tem que
  significar algo; se tudo é colorido, nada chama atenção.
- **Don't** deixar o cockpit parecer um clone barato de template Airbnb, uma planilha corporativa
  fria (grades cinzas densas estilo SAP), ou um app social de consumo com stories/reels
  (PRODUCT.md — Anti-references).
- **Don't** usar `border-left`/`border-right` colorido acima de 1px como faixa decorativa em
  card, item de lista ou alerta.
- **Don't** usar `background-clip: text` com gradiente — ênfase vem de peso ou tamanho, nunca de
  gradiente no texto.
- **Don't** deixar contraste de texto abaixo de 4,5:1 (corpo) ou 3:1 (texto grande) — é portão de
  CI via `axe-core`, não sugestão.
