# ADR-0003 — Stack canônica e versões travadas

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
A seção 5 do prompt único especifica uma stack completa (pnpm+Turborepo, Next.js `standalone`,
React 19, Tailwind v4, shadcn/ui, Drizzle, Postgres 16, Better Auth, CASL, BullMQ, etc.) mas
explicitamente proíbe presumir números de versão.

## Decisão
Adotar a stack da seção 5.1–5.8 na íntegra. Antes de qualquer `package.json` na Fase 0,
**verificar a versão estável vigente na data de início** de cada dependência crítica (Next.js,
Drizzle, Better Auth, Tailwind) e registrar a versão exata + data de verificação neste ADR.

## Justificativa
"Não presuma números de versão; verifique" é regra explícita da seção 5. Uma versão presumida e
errada quebra build ou introduz API alucinada.

## Consequências
- Este ADR ganha um adendo com a tabela de versões travadas assim que a Fase 0 abrir.
- CI roda `pnpm audit` e Semgrep desde o primeiro commit.
- Biblioteca instalada por necessidade, não todas de uma vez (seção 5.8).

## Versões travadas (verificadas na Fase 0 — 2026-07-27)
| Dependência | Versão travada | Nota |
|---|---|---|
| pnpm | 11.17.0 | Requer Node ≥ 22; `packageManager` no `package.json` raiz via Corepack |
| Turborepo | 2.10.7 | `turbo.json` usa a chave `tasks` (não `pipeline`, removida na v2.0) |
| Next.js | 16.2.x | Turbopack é o padrão em `dev`/`build`; `output: 'standalone'` continua válido |
| React / react-dom | 19.2.x | Par obrigatório do Next 16 |
| Tailwind CSS | 4.3.x | CSS-first `@theme`, um único `@import "tailwindcss"`, sem `tailwind.config.js` |
| Drizzle ORM | 0.45.x | Pré-1.0 — versão exata travada, não `^`/`~` |
| drizzle-kit | 0.31.x | Idem |
| Better Auth | 1.6.25 | Confirma plugins `organization`, `twoFactor`, `passkey`, `magicLink` |
| **PostgreSQL** | **17** (revisão da decisão original) | A spec original assumia 16; 17/18 são as opções atuais e o próprio ADR-0003 proíbe presumir. Escolhido 17 sobre 18: maturidade de PgBouncer/pgBackRest pesa mais que os recursos mais novos (e menos testados em produção) do 18 para um alvo self-hosted crítico em backup/restore. Reavaliar 18 na separação de banco da Fase 5 |
