# Design System: Titan Stay — Storefront

## 1. Overview

**Creative North Star: "A Casa Recebe"**

Se o cockpit é uma torre de controle escura, o storefront é a luz da entrada de uma casa bem
cuidada. O registro é `brand` (PRODUCT.md), não `product`: a página existe para converter um
visitante em hóspede em poucos minutos, não para sustentar um turno de 8 horas. Onde o cockpit é
denso, escuro e neutro, o storefront é claro, espaçoso e quente — mas continua sendo a MESMA
empresa: o verde-acento da Titan atravessa as duas superfícies como o único fio de identidade
visual deliberadamente compartilhado (ver `DESIGN.md` da raiz, seção 2).

As mesmas três rejeições do cockpit valem aqui, por serem anti-referência de marca, não só de
componente (PRODUCT.md): nenhum clone de booking engine genérico, nenhuma grade de marketplace
com fotografia de estoque, nenhum growth-hacking agressivo (contador regressivo, pop-up de saída,
prova social fabricada).

**Key Characteristics:**
- Claro por padrão — fundo quente e neutro, nunca o quase-preto azulado do cockpit.
- Um único acento verde (o mesmo `oklch(0.78 0.170 155)` do cockpit), usado com a mesma raridade:
  CTA primário, disponibilidade positiva, estado ativo — nunca decoração de seção inteira.
- Um segundo tom quente (terracota) aparece só como calor humano — selo de "curadoria Titan",
  destaque editorial — nunca como CTA nem como sinalização de status (que é papel exclusivo do
  verde/vermelho/âmbar semânticos).
- Tipografia com serifa no display (hospitalidade, editorial) pareada com sans geométrica no
  corpo — o oposto do cockpit, que é 100% sans. Preço em mono tabular, herdando a mesma disciplina
  de legibilidade financeira do cockpit, por ser a mesma marca vendendo confiança numérica.
- Elevação suave é permitida em repouso aqui (cards com sombra leve) — decisão deliberadamente
  diferente do cockpit (`DESIGN.md` raiz, "Interaction-Only Lift Rule"): um storefront de
  hospitalidade pode ter profundidade convidativa; uma ferramenta de 8 horas não pode.

## 2. Colors

Paleta clara e quente, com o verde Titan como único acento compartilhado com o cockpit.

### Primary
- **Verde Titan** (`oklch(0.78 0.170 155)`, `accent`): idêntico ao token do cockpit — mesmo
  acento, reconhecível como a mesma marca em qualquer superfície. Reservado para CTA primário
  ("Reservar", "Confirmar pagamento") e indicador de disponibilidade positiva. Texto sobre o
  acento usa `accent-fg` (`oklch(0.18 0.03 155)`, quase-preto) para contraste — mesmo par do
  cockpit.

### Warm (exclusivo do storefront — não existe no cockpit)
- **Terracota** (`oklch(0.72 0.14 45)`, `warm`): calor humano — usado só em elementos editoriais
  não-semânticos (selo "Curadoria Titan", ícone de destaque na página da unidade, sublinhado de
  citação). **Nunca** em botão, nunca em `StatusPill`/badge de estado — isso confundiria "toque
  de marca" com "sinalização de status", que é papel do verde/vermelho/âmbar.

### Neutral
- **Fundo** (`oklch(0.97 0.012 85)`, `bg`): areia clara, leve viés quente — a "luz de entrada",
  oposto deliberado do `oklch(0.16 0.012 250)` do cockpit.
- **Superfície** (`oklch(0.995 0.006 85)`, `surface`): cards, formulário — quase branco, viés
  quente sutil.
- **Superfície elevada** (`oklch(0.94 0.014 85)`, `surface-2`): seções secundárias, hover de
  linha, fundo de rodapé.
- **Borda sutil** (`oklch(0 0 0 / 8%)`, `border`): mesma opacidade do cockpit, adaptada a fundo
  claro.
- **Texto principal** (`oklch(0.24 0.03 250)`, `ink`): tinta quase-preta com viés azulado — ecoa
  o `fg` do cockpit (mesma família de tom), mas em positivo sobre fundo claro.
- **Texto muted** (`oklch(0.46 0.02 250)`, `ink-muted`): legenda, texto secundário — nunca abaixo
  de 4,5:1 contra `bg`/`surface`.

### Named Rules
**A One-Accent-Two-Registers Rule.** O verde Titan é o único elemento de cor deliberadamente
idêntico entre cockpit e storefront — todo o resto da paleta (fundo, superfícies, tinta, o tom
quente) é composição própria deste registro. Isso é o que faz as duas superfícies lerem como
"mesma empresa, contextos diferentes" em vez de "dois produtos sem relação" ou "reskin
preguiçoso do mesmo tema".

**The Status-Needs-Text Rule** (herdada do cockpit, vale aqui também): disponibilidade, sucesso
de pagamento e erro nunca comunicam só por cor.

### Semantic
- `positive` (`oklch(0.78 0.170 155)`, mesmo tom do acento — disponibilidade, pagamento aprovado)
- `negative` (`oklch(0.55 0.19 25)`, mais escuro que o do cockpit para manter 4.5:1 em fundo claro)
- `warning` (`oklch(0.62 0.13 80)`, idem)
- `info` (`oklch(0.5 0.1 250)`, idem)

## 3. Typography

**Display Font:** uma serifa editorial (ex.: Fraunces/Lora; fallback `Georgia, "Times New Roman",
serif`) — headline da home, nome da unidade, título de seção. Escolha deliberada de contraste com
o cockpit: hospitalidade fala em serifa, ferramenta de turno fala em sans.
**UI/Body Font:** Geist (fallback: system-ui, sans-serif) — mesma sans do cockpit para formulário,
navegação, corpo de texto; ponto de continuidade discreto entre as duas superfícies.
**Numeric/Mono Font:** Geist Mono (fallback: monospace) — todo valor monetário (diária, total da
cotação) em figuras tabulares. Não é regra de densidade aqui (não há tabela de 40 linhas), é
herança deliberada da disciplina "preço é fato, não estilo" que atravessa a marca Titan inteira.

### Hierarchy
- **Display** (serifa, 600, `clamp(2rem, 4vw, 3.5rem)`, 1.05): headline da home, nome da unidade
  na página de detalhe.
- **Subhead** (serifa, 500, `clamp(1.25rem, 2vw, 1.75rem)`, 1.2): título de seção ("Unidades
  disponíveis", "Sua reserva").
- **Body** (Geist, 400, 1rem, 1.6): texto corrido, descrição da unidade, texto de formulário —
  levemente maior que o cockpit (0.9375rem) porque aqui o público é leigo, lendo uma vez, não um
  operador escaneando a mesma tela por horas.
- **Label** (Geist, 500, 0.8125rem, tracking 0.01em): rótulo de campo, legenda pequena.
- **Numeric** (Geist Mono, 500, 1rem, `font-variant-numeric: tabular-nums`): diária, total,
  qualquer valor monetário.

### Named Rules
**The Tabular-Nums-For-Money Rule.** Todo preço exibido usa Geist Mono com `tabular-nums` —
mesma regra do cockpit, aplicada aqui por identidade de marca (dinheiro é tratado com o mesmo
rigor visual em qualquer superfície Titan), não por necessidade de comparar colunas.

## 4. Elevation

Ao contrário do cockpit ("Interaction-Only Lift Rule" — plano em repouso), o storefront permite
elevação suave em repouso: um card de unidade com sombra leve convida ao toque/clique de um jeito
que uma ferramenta de trabalho não deveria. Ainda assim, nada de glow ou glassmorphism atrás de
dado/preço (anti-referência compartilhada com o cockpit, PRODUCT.md) — a sombra é profundidade
física discreta, nunca brilho decorativo.

### Shadow Vocabulary
- **card-rest** (`box-shadow: 0 1px 3px oklch(0 0 0 / 6%), 0 1px 2px oklch(0 0 0 / 4%)`): card de
  unidade, bloco de cotação — em repouso, não só no hover (diferença deliberada do cockpit).
- **card-hover** (`box-shadow: 0 8px 24px oklch(0 0 0 / 10%)`): elevação adicional no hover do
  card de unidade — reforça affordance de clique.
- **modal** (`box-shadow: 0 16px 48px oklch(0 0 0 / 18%)`): modal de calendário, confirmação —
  mesma função do cockpit, sombra proporcionalmente mais leve por rodar sobre fundo claro.

## 5. Components

### Buttons
- **Shape:** raio `0.75rem` — mesmo raio de controle do cockpit (ponto de continuidade de
  "acabamento Titan").
- **Primary:** fundo `accent` (verde Titan), texto `accent-fg`, padding `12px 24px` — "Buscar",
  "Reservar", "Confirmar pagamento". Nunca mais de um por tela/etapa do checkout.
- **Secondary:** fundo `surface-2`, texto `ink`, mesmo raio — "Ver detalhes", "Voltar".
- **Hover/Focus:** leve escurecimento no primary; anel de foco 2px em `accent`, nunca suprimido
  (mesma regra do cockpit).

### Unit Card (componente de assinatura)
- **Shape:** raio generoso (`1.25rem`, mesmo `radius-card` do cockpit).
- **Estrutura:** imagem (proporção 4:3, placeholder de cor sólida + ícone nesta fase, sem
  otimização AVIF real ainda) → nome da unidade (Subhead) → 1-2 linhas de descrição (Body,
  truncada) → diária a partir de (Numeric) → badge de disponibilidade.
- **Elevação:** `card-rest` em repouso, `card-hover` no hover (ver seção 4) — única superfície do
  sistema com elevação em repouso, por design.
- **Proibido:** fotografia de estoque genérica passando por foto real da unidade — nesta fase
  (placeholder explícito), um bloco de cor + texto "foto real em breve" é mais honesto que uma
  imagem de banco de imagens fingindo ser a unidade.

### Availability Badge
- **Style:** pílula (`rounded: 9999px`), fundo semântico sólido + texto sempre presente — mesma
  regra do `StatusPill` do cockpit ("Disponível" / "Sob consulta"), cor nunca isolada.

### Quote Summary (componente de assinatura)
- **Estrutura:** linha "diária × noites" → linha de total em Numeric, tamanho maior → nota de TTL
  da cotação ("válida por 15 minutos") — espelha a mesma transparência do cockpit
  (`packages/domain` `createQuote`), expressa de forma simples para o hóspede leigo.
- **Proibido:** qualquer taxa que apareça só nesta etapa sem ter sido mostrada na página da
  unidade — princípio de design 1 do PRODUCT.md ("o preço nunca surpreende").

### Payment Method Selector
- **Style:** duas opções lado a lado (PIX / Cartão) como cartões selecionáveis, nunca dropdown —
  poucas opções, alta visibilidade.
- **Regra dura (I4):** a opção "Cartão" nunca renderiza campo de número/validade/CVV nesta
  aplicação — placeholder explícito de "hosted fields do gateway entram aqui" até o adapter de
  pagamento estar plugado (ver `docs/fase-atual.md`, Fase 2).

### Navigation
- **Style:** header claro, logo + busca compacta, sem sidebar (não há 20 rotas aqui — é um funil
  linear de 4-5 páginas). Rodapé com identidade Titan (razão social, CNPJ quando existir, canais
  de contato) — reforça que é a mesma empresa por trás do cockpit.

## 6. Do's and Don'ts

### Do:
- **Do** manter o verde Titan (`oklch(0.78 0.170 155)`) como único elemento de cor
  deliberadamente idêntico ao cockpit — é o fio de identidade entre os dois registros.
- **Do** usar Geist Mono com `tabular-nums` em todo preço exibido, do card de unidade ao resumo
  de cotação.
- **Do** permitir sombra leve em repouso no Unit Card — diferença intencional do cockpit, não
  descuido.
- **Do** mostrar o mesmo preço da página da unidade até o checkout, sem taxa surpresa.
- **Do** usar o terracota (`warm`) só como calor editorial — nunca em botão ou badge de status.

### Don't:
- **Don't** reusar os tokens escuros do cockpit (`--color-bg: oklch(0.16 ...)` etc.) — registro
  errado para esta superfície.
- **Don't** renderizar campo de número de cartão nesta aplicação em nenhuma circunstância (I4).
- **Don't** usar glow ou glassmorphism atrás de preço/dado — mesma anti-referência do cockpit,
  só a elevação em repouso do Unit Card é diferente, não a proibição de brilho decorativo.
- **Don't** usar contador regressivo, pop-up de saída, ou prova social sem dado real por trás —
  anti-referência de marca (PRODUCT.md), não só de componente.
- **Don't** deixar contraste de texto abaixo de 4,5:1 (corpo) ou 3:1 (texto grande).
