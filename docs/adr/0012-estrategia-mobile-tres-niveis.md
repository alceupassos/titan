# ADR-0012 — Estratégia mobile em três níveis

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
Diferentes atores capturam evidência em contextos diferentes (hóspede ocasional vs. prestador
recorrente vs. equipe própria em uso diário), e o nível de garantia possível depende da origem da
captura (seção 9.9).

## Decisão
Três níveis (T1/T2/T3), mapeados aos níveis de garantia A1/A2/A3:
- **T1** — câmera no navegador (hóspede, vistoria compartilhada) → nível A1.
- **T2** — PWA instalada (prestador, camareira) → nível A2.
- **T3** — app nativo Expo, offline-first (`apps/field`, equipe própria) → nível A3.

## Justificativa
Nem todo ator precisa do nível mais caro (app nativo). O nível de garantia é limitado pela
origem da captura, não pela vontade do produto.

## Consequências
- App nativo para hóspede só é revisitado se a taxa de recorrência de reserva direta ultrapassar
  ~25%.
- Consequências financeiras específicas (retenção de caução, contestação de canal) exigem nível
  mínimo A2 — ver `docs/adr/0013-limitacoes-captura-navegador.md` e seção 9.9 da spec.
