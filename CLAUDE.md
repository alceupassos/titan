# Titan Stay — contrato do repositório

> Rodada 0 concluída. Este arquivo, `docs/invariantes.md`, `docs/anti-padroes.md`, `docs/adr/*`,
> `docs/domain/*` e `docs/roadmap.md` são o entregável da Rodada 0 (ver `PROMPT_UNICO_Titan.md` /
> `prompt.md`, seção 14). Nenhum código, migration, `.claude/agents/*` ou hook existe ainda —
> isso pertence à Fase 0, que só abre depois do "ok" do usuário às perguntas de
> `docs/decisoes-de-negocio.md`.

## Invariantes (leia antes de qualquer coisa)
@docs/invariantes.md          # I1 a I10, com a camada onde cada uma é aplicada

## Convenções duras
- Dinheiro: inteiros em centavos + Dinero.js. `number` para valor monetário é erro.
- Datas de estadia: datas civis (Temporal/date-fns+tz). Timestamp UTC é erro.
- Toda Server Action valida (Zod) **e** autoriza (CASL) dentro dela mesma.
- Contexto de tenant: `SET LOCAL` dentro de transação. `SET` sem `LOCAL` é vazamento.
- Migration aplicada nunca se altera. Corrige-se com migration nova.
- Alíquota, código de serviço, retenção e prazo de canal: tabela versionada. Nunca código.
- Evidência não tem rota de exclusão para papel algum.
- Código em inglês; documentação, UI e domínio fiscal em pt-BR (`rps`, `nfse`, `iss`, `repasse`).

## Anti-padrões
@docs/anti-padroes.md         # seção 11 do prompt único, literal

## Decisões de arquitetura
@docs/adr/                    # ADR-0001 a ADR-0019 — recomendação + justificativa da Rodada 0

## Modelo de domínio
@docs/domain/modelo-dominio.md
@docs/domain/glossario.md

## Roadmap
@docs/roadmap.md              # fases F0–F10, portões de saída, faixas paralelas autorizadas

## Decisões de negócio pendentes
@docs/decisoes-de-negocio.md  # as 8 perguntas da Rodada 0 — bloqueiam a Fase 0 até respondidas

## Contexto de design
@PRODUCT.md                   # registro (product, cockpit-first), usuários, posicionamento, anti-references
@DESIGN.md                    # tokens OKLCH, tipografia, elevação e componentes do cockpit (ADR-0016)

## Estado do trabalho
@docs/fase-atual.md           # fase, faixas abertas, portões pendentes

## Comandos
Ainda não existem — nenhum monorepo foi inicializado nesta rodada. Quando a Fase 0 abrir,
este bloco passa a listar `pnpm dev` · `pnpm test` · `pnpm test:auth` · `pnpm db:migrate` · `pnpm gate`.
