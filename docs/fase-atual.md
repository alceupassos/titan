# Estado do trabalho

**Fase atual:** Fase 0 (Fundação) — Passos 0-8 entregues. Aguardando os 3 auditores rodarem antes
de fechar a fase (ver "Próximo passo").

**Gap conhecido 1:** VPS Contabo real ainda não provisionada. "Deploy sem downtime" e
"restauração de backup cronometrada" têm scripts reais (`infra/scripts/deploy-swap.sh`,
`infra/scripts/backup-restore-drill.sh`) que rodam contra Docker Compose local, não a VPS real —
ver ADR-0002.

**Gap conhecido 2:** Docker Desktop não estava rodando nesta máquina durante a Fase 0. Tudo que
depende de Docker está escrito e com typecheck limpo, mas sem execução ao vivo nesta sessão:
- `packages/db/test/tenant-isolation.pgbouncer.test.ts` (skip automático sem Docker)
- `infra/scripts/deploy-swap.sh`, `infra/scripts/backup-restore-drill.sh`
- `docker compose -f infra/docker-compose.yml up` (validado só via `docker compose config`)

O job `tenant-isolation` do CI (`.github/workflows/ci.yml`) roda a prova de PgBouncer real nos
runners do GitHub Actions assim que houver um push — Docker está sempre disponível lá.

**Entregado e verificado com execução real nesta sessão:**
- `packages/money`, `packages/dates`, `packages/domain`, `packages/auth`: 42 testes reais
  passando (7+5+25+5), typecheck limpo em todos os pacotes.
- `packages/db`: schema/RLS/client com typecheck limpo; teste de pooling escrito e confirmado
  "skip" correto (sem Docker) em vez de falso positivo.
- `apps/console`, `apps/web`: build real do Next.js 16 bem-sucedido, incluindo duas correções
  encontradas só pela build de verdade — `middleware.ts` → `proxy.ts` (convenção nova) e
  `turbopack.root` explícito (ambiguidade de lockfile).
- Todos os 11 hooks provados com payload real — ver `docs/hook-proofs.md`.
- `.github/workflows/ci.yml` validado como YAML bem formado, com 3 jobs.

**Próximo passo:** rodar `invariant-auditor`, `security-reviewer` e `convention-checker` sobre
tudo o que foi construído (seção 14 do ciclo de fase, prompt único). Só depois disso o marcador
`PORTAO_PENDENTE` é escrito e removido, fechando a Fase 0 de verdade. Nenhum commit git foi feito
ainda nesta sessão — pendente de confirmação do usuário.
