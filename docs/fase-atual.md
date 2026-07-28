# Estado do trabalho

**Fase atual:** Fase 0 (Fundação) — Passos 0-8 entregues, incluindo duas rodadas de correção
pós-auditoria. Parado por decisão do usuário após a 2ª rodada de auditoria: corrigidos os 3
achados com risco real de segurança/trava (detalhe abaixo); o resto fica registrado como dívida
técnica conhecida, sem uma 3ª rodada de auditoria automática.

**Gap conhecido 1:** VPS Contabo real ainda não provisionada. "Deploy sem downtime" e
"restauração de backup cronometrada" têm scripts reais que rodam contra Docker Compose local —
ver ADR-0002.

**Gap conhecido 2:** Docker Desktop não estava rodando nesta máquina durante toda a Fase 0. Tudo
que depende de Docker está escrito e com typecheck limpo, mas sem execução ao vivo nesta sessão.
O job `tenant-isolation` do CI roda a prova de PgBouncer real nos runners do GitHub Actions.

**Gap conhecido 3:** `.env.example` ainda mostra a string de conexão antiga (papel `titan`,
sem `TITAN_APP_PASSWORD`/`DATABASE_ADMIN_URL`) — a correção do `.claude/settings.json` que
libera a leitura/edição desse arquivo só passa a valer numa sessão nova (motor de permissões
cacheia a regra do início da sessão). `infra/README.md` e os comentários em
`drizzle.config.ts`/`client.ts` já têm o valor correto a usar manualmente até lá.

## Duas rodadas de auditoria (`invariant-auditor`, `security-reviewer`, `convention-checker`)

**1ª rodada** (sobre a construção inicial): 8 FALHAS + 2 violações de convenção, todas
corrigidas. Ver `docs/hook-proofs.md`, seção "Correções da auditoria".

**2ª rodada** (sobre o estado corrigido): confirmou 5 achados genuinamente fechados
(FALHA-D/F-2, FALHA-F/F-9, parte Bash da FALHA-G, casos centrais de FALHA-E e FALHA-H, o
redesenho da FALHA-C), e encontrou **6 achados novos**, dos quais **3 corrigidos nesta sessão**
por decisão explícita do usuário (os com risco real de segurança/trava) e **3 registrados como
dívida técnica** (sem risco de trava ou vazamento imediato, adiáveis para F1+):

### Corrigidos na 2ª rodada

- **F-A/B′ (crítico):** as migrations `0000_init.sql` e `0001_app_role_grants_and_rls.sql`
  nunca tinham caminho de aplicação real — não existia `migrations/meta/_journal.json`, e
  `drizzle-kit migrate`/o migrator programático do Drizzle falhavam com "Can't find
  meta/_journal.json". Corrigido: journal e snapshots reais gerados pela própria ferramentação
  do drizzle-kit (não escritos à mão) e commitados em `packages/db/migrations/meta/`. Verificado
  com `readMigrationFiles` real (lê as duas migrations, na ordem certa) e com
  `drizzle-kit migrate` (agora tenta conectar no banco — falha por falta de Docker, não mais por
  journal ausente).
- **N1:** `0001_app_role_grants_and_rls.sql` tinha `ALTER DEFAULT PRIVILEGES ... GRANT ...
  UPDATE ON TABLES`, que concederia UPDATE a `titan_app` em toda tabela futura — incluindo
  tabelas que ainda vão carregar I3/I7 (`ledger_entries`, `fiscal_document`). Como a migration
  nunca tinha sido commitada, foi editada diretamente (não uma migration 0002 corretiva): a
  regra agora é que cada tabela nova declara seus próprios grants explícitos, como `audit_log`
  já fazia.
- **N4:** a isenção anti-autobloqueio `/^\.claude[\\/]/` em `block-evidence-deletion.mjs` e
  `block-ledger-mutation.mjs` só casava caminho RELATIVO — o harness sempre envia `file_path`
  ABSOLUTO, então a isenção nunca disparava de verdade fora dos meus próprios testes com caminho
  relativo (um bug na própria correção da rodada anterior). Corrigido para
  `/(^|[\\/])\.claude[\\/]/`, que casa ".claude" como segmento de caminho em qualquer posição.
  Reverificado com payload real usando o caminho absoluto verdadeiro dos dois hooks.

### Registrados como dívida técnica (não corrigidos nesta sessão, por decisão do usuário)

- **N2:** o campo `assuranceLevel` da captura de evidência não entra no hash da cadeia — forjar
  `A1 → A3` numa captura já encadeada não quebra `verifyChain`. Mesma classe de bug que a
  FALHA-C original, que cobriu `envelope`/motivo de descarte mas não este campo.
- **N3:** a lógica `removesReversalId` em `block-ledger-mutation.mjs` é código morto — a
  condição exige que `reversal_of_id` esteja AUSENTE do conteúdo, mas o statement real que ela
  deveria pegar (`DROP COLUMN reversal_of_id`) necessariamente contém essa string.
- **F-G′/F-E′:** cobertura parcial nos dois hooks de conteúdo — Drizzle em camelCase
  (`ledgerEntries`) nunca casa o padrão snake_case; `TRUNCATE` não coberto para ledger; `GRANT
  ALL` não coberto; variável ORM que não começa literalmente com "evidence" (ex.:
  `photoEvidence`) escapa do padrão.
- **F-H′:** `checkIn()` valida `authorizedBy`/`reason` mas descarta a informação — retorna só o
  novo `UnitStatus`, sem carregar quem autorizou para nenhum registro/evento.
- **N5:** `verifyChain` valida qualquer PREFIXO da cadeia — truncar a cauda (remover as últimas
  N entradas) não quebra a verificação, sem uma âncora externa (contagem ou hash da cabeça
  persistida fora da cadeia).
- **N6:** a lição da FALHA-D (guarda absoluta do CASL por último, não por primeiro) só foi
  aplicada a `evidence`/`delete`. `ledger` (I3) e `fiscal_document` (I7) continuam expostos ao
  mesmo padrão — um `can("delete","all")` futuro os libera em silêncio.

**Entregado e verificado com execução real nesta sessão:** ver `docs/hook-proofs.md` para o
detalhe completo de cada hook e cada correção, com payload real e resultado.

**Próximo passo:** este documento registra o estado real, sem maquiagem — a Fase 0 tem dívida
técnica conhecida e documentada, não escondida. Antes de fechar o portão de saída de verdade
(marcador de portão pendente), decidir se a dívida acima é aceitável para abrir a Fase 1 ou se
merece mais uma rodada. Nenhum commit cobrindo as duas rodadas de correção foi feito ainda —
pendente de confirmação do usuário.
