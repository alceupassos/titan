# Provas dos 11 hooks — portão de saída de F0

Requisito do roadmap (docs/roadmap.md, F0): "cada hook do 5.11.4 provado por um caso que ele
bloqueia". Cada hook abaixo foi executado manualmente com um payload real (`stdin` JSON, como o
Claude Code envia de verdade) provando o caso que deve bloquear (exit 2) e, onde aplicável, um
caso equivalente que deve passar (exit 0). Reprodutível — os comandos estão em
`.claude/hooks/*.mjs`, basta repetir com `echo '<payload>' | node .claude/hooks/<nome>.mjs`.

| Hook | Caso que bloqueia (provado) | Caso que permite (provado) |
|---|---|---|
| `block-applied-migration.mjs` | — (não testado com migration commitada; exige `git show HEAD:` real) | Migration nova não commitada → exit 0 ✅ |
| `block-evidence-deletion.mjs` | `DELETE FROM evidence` em `packages/evidence/**` → exit 2 ✅; `rm` via Bash em caminho de evidência → exit 2 ✅; payload JSON corrompido → exit 2 ✅ (falha fechada, I10) | Leitura normal (`db.select().from(evidenceLog)`) → exit 0 ✅ |
| `block-ledger-mutation.mjs` | `UPDATE ledger_entry ...` → exit 2 ✅; payload corrompido → exit 2 ✅ (falha fechada, I3) | `INSERT` de lançamento de estorno com `reversalOfId` → exit 0 ✅ |
| `block-hardcoded-tax.mjs` | `const issRate = 0.05;` em `packages/fiscal/**` → exit 2 ✅ | Lookup em `tax_rules` versionada → exit 0 ✅ |
| `block-money-float.mjs` | `amountCents: number` em campo com nome monetário → exit 2 ✅ | (não re-testado nesta rodada; comportamento idêntico ao smoke test inicial) |
| `block-set-without-local.mjs` | `` SET app.tenant_id = ... `` sem `LOCAL` → exit 2 ✅ | `` SET LOCAL app.tenant_id = ... `` → exit 0 ✅ |
| `block-secrets.mjs` | `.env` com valor real (`DATABASE_URL=postgres://user:pass@...`) → exit 2 ✅ | `.env.example` com placeholder vazio → exit 0 ✅ |
| `run-package-tests.mjs` | Teste falhando de propósito em `packages/domain` → exit 2 com output do vitest ✅ (arquivo de prova criado, testado, removido) | Suíte verde → exit 0 ✅ |
| `log-subagent.mjs` | — (não bloqueia; hook informativo) | Anexa linha real a `docs/build-log.md` com timestamp/modelo/resultado → exit 0 ✅ (linha de teste removida após a prova, para não poluir o log real) |
| `phase-gate.mjs` | `PORTAO_PENDENTE: ...` presente em `docs/fase-atual.md` → exit 2 ✅ | Ausente → exit 0 ✅ |
| `session-brief.mjs` | — (não bloqueia; hook informativo) | Imprime fase atual lida de `docs/fase-atual.md` → exit 0 ✅ |

## Nota sobre `block-applied-migration.mjs`

Este hook depende de `git show HEAD:<caminho>` para decidir se uma migration já foi "aplicada"
(commitada). Só foi provado o caminho "migration nova, ainda não commitada → permite". O caminho
"migration já commitada → bloqueia" só pode ser provado de verdade depois do primeiro commit real
deste monorepo (não simulado). Ação pendente: depois do primeiro `git commit`, editar
qualquer arquivo em `packages/db/migrations/*.sql` já commitado e confirmar exit 2.

## Nota sobre falha fechada vs. aberta

`block-evidence-deletion.mjs` e `block-ledger-mutation.mjs` foram desenhados para **falhar
fechado** (bloquear) se o payload do hook não puder ser interpretado como JSON — porque protegem
I10 e I3, que são não negociáveis. Os demais hooks de convenção/estilo (`block-money-float`,
`block-hardcoded-tax`, `block-set-without-local`, `block-applied-migration`) falham **aberto**
(permitem) nesse mesmo cenário, porque são checagens de estilo onde um falso bloqueio por payload
malformado seria mais disruptivo do que útil. Essa assimetria é intencional, não descuido.
