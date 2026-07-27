# ADR-0016 — Direção visual e as três rejeições

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
As 4 imagens de referência (`.webp`) na pasta do projeto foram inspecionadas diretamente. Todas
compartilham o mesmo DNA: tema escuro, KPI cards com número grande + badge de variação + gráfico
sparkline, gráficos com gradiente, donut chart com legenda, e (em duas delas) glow/glassmorphism
atrás de elementos e barras hachuradas — confirmando exatamente os padrões descritos na seção
5.9 do prompt único.

## Decisão
- **Cockpit, portal do proprietário, portal do prestador:** tema escuro por padrão, denso, acento
  verde, `radius-card` de 20px, densidade de 40px por linha, sidebar com rótulos + `cmdk` (⌘K).
- **Storefront e área do hóspede:** tema claro, quente, orientado a foto.
- Um único conjunto de tokens `@theme`, dois temas, `next-themes` para alternar; cockpit também
  oferece modo claro.
- **Rejeitar três padrões vistos nas referências:** (1) glow/glassmorphism atrás de dado — nunca
  atrás de número, tabela ou texto; (2) barra hachurada em série de valor real — hachura só em
  "previsto"/"período anterior"; (3) múltiplos gradientes saturados diferentes por conjunto de
  KPI cards — cor deve significar status/variação, não decoração.

## Justificativa
Bonito em imagem de marketing, ilegível em ferramenta usada 8h/dia. Contraste WCAG 2.2 AA
(4.5:1) é requisito verificado por `axe` no CI, não sugestão — e vidro sobre dado reprova.

## Consequências
- Storybook com teste de acessibilidade e snapshot visual como portão.
- `a11y-reviewer` reprova qualquer componente com as três rejeições.
