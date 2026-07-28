# Estado do trabalho

**Fase atual:** Fase 2 (Direto) — **todos os 6 passos do plano aprovado concluídos**: ledger
básico + fila de aprovações no domínio, migration 0003, contratos Zod, dois adapters de gateway
(Asaas/PIX + Stripe/cartão) em faixas paralelas, storefront (`apps/web`) com identidade própria,
fila real de `/aprovacoes`, worker de webhook com BullMQ, e integração final do checkout
ponta a ponta. Ver seção "Fase 2 — Direto" abaixo para o detalhe de cada passo. Fase 1 (Core) e
Fase 0 (Fundação) seguem fechadas como já registrado.

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

**Próximo passo (histórico):** entrar em plan mode para a Fase 1 (Core) — feito; ver seção
seguinte para o resultado. A dívida técnica listada acima fica para revisão quando as
invariantes/pacotes correspondentes (packages/evidence, packages/ledger, packages/auth) ganharem
trabalho real em fases futuras — não foi escopo da Fase 1 reabrir.

## Fase 1 — Core (disponibilidade, tarifas, cotação, reserva, tape chart)

Plano aprovado em plan mode (`docs/roadmap.md`, escopo: `availability` com `EXCLUDE`, tarifas,
cotação, reserva no cockpit, tape chart v1). Decisão do usuário sobre o tape chart: construir UMA
variante sólida agora (canvas 2D direto), não as 2-3 variantes que o ADR-0018 original sugeria
comparar — registrado como pendência do próprio ADR.

**Passo 1 — `packages/domain`:** `Reservation` promovida a agregado completo, `RatePlan`
(`priceStay`, `ratePlanCoversStay`, min-stay/vigência), `Quote` (`createQuote`, `isQuoteExpired`,
zero I/O). 37 testes novos, typecheck limpo.

**Passo 2 — `packages/db`:** migration `0002_availability_rates_reservations.sql` — `units`,
`rate_plans`, `reservations` (coluna `stay daterange`), constraint central de I1
(`reservations_no_overlap EXCLUDE USING gist (unit_id WITH =, stay WITH &&) WHERE status IN
('pending','confirmed')`) + `CHECK (lower(stay) < upper(stay))`, RLS+política nas 3 tabelas,
grants explícitos a `titan_app` (sem `ALTER DEFAULT PRIVILEGES`, lição do achado N1 da Fase 0).
Journal/snapshot gerados via `drizzle-kit generate` real (mesma técnica do fix F-A/B′) e
verificados com `readMigrationFiles()` — as 3 migrations (0000/0001/0002) são descobertas em
ordem.

**Passo 3 (faixas paralelas):**
- **3a — teste de concorrência** (`packages/db/test/reservation-concurrency.test.ts`): ~100
  tentativas concorrentes de reserva sobreposta na mesma unidade (espera exatamente 1 sucesso, 99
  falhas `23P01`), controle positivo (estadias disjuntas, todas passam) e controle negativo
  (`cancelled` sobreposto, ambas passam — prova que o filtro parcial da EXCLUDE funciona).
  **Não executado ao vivo** — Docker Desktop sem o daemon rodando nesta máquina; suíte pula
  corretamente (`describe.skipIf`), não finge sucesso. **Isto significa que o portão de saída
  formal da Fase 1 ("100 reservas simultâneas → exatamente 1 confirma") está escrito e
  typecheck-limpo, mas ainda NÃO tem prova de execução real nesta sessão** — mesma limitação já
  registrada como Gap conhecido 2 da Fase 0. Precisa rodar com Docker ativo (local ou CI) antes de
  considerar o portão genuinamente fechado.
- **3b — seed de demonstração** (`packages/db/seed/index.ts`): 1 tenant, 8 unidades, ~12
  rate plans, 32 reservas determinísticas nos 5 canais, cadeia sequencial por unidade que nunca
  viola I1 por construção. Não executado contra banco vivo (mesmo motivo).
- **3c — shell do cockpit**: sidebar com as ~20 rotas da seção 7.2 do prompt único (rotas do
  proprietário movidas para `/portal/*` para não colidir com as de staff), `cmdk`, toggle de
  densidade persistido em `localStorage`, ~29 páginas com estado vazio real (nunca só `<h1>`),
  `proxy.ts` fechado com `getSessionCookie` (checagem de presença de cookie — validação completa
  fica nas Server Actions, regra dura do CLAUDE.md). Build real (`next build`) verificado.

**Passo 4 — tape chart v1** (`packages/ui/src/components/TapeChart.tsx`): canvas 2D direto,
virtualização real (paginação de ~30 dias, scroll vertical), 5 cores de canal novas em
`theme.css` (exceção documentada à regra de acento único — codificação categórica de dado, não
decoração), arraste via `@dnd-kit/core` (`PointerSensor` sobre overlay transparente + tradução
pixel→(unidade,data) em lógica própria). Integrado em `(staff)/calendario` com dados de amostra
(sem banco vivo). ADR-0018 atualizado: status "Aceito, parcialmente implementado", comparação de
2-3 variantes formalmente adiada.

**Passo 5 — cotação e reserva no cockpit:** `packages/contracts` ganha os primeiros schemas Zod
(`QuoteRequestSchema`, `QuoteResponseSchema`, `CreateReservationSchema`). Server Actions reais em
`apps/console/app/(staff)/reservas/nova/actions.ts` — validam com Zod e autorizam com CASL dentro
de si mesmas, nunca confiando no `proxy.ts`. Preço sempre RECALCULADO no servidor no momento da
confirmação (nunca aceito do cliente, nem via `quoteId`). Violação da constraint EXCLUDE
(`23P01`) é traduzida para mensagem de conflito clara — o pré-check em memória
(`canAcceptReservation`) nunca é tratado como árbitro final.

**Dívida técnica nova, documentada nos próprios arquivos (não escondida):**
- Não existe mapeamento persistido usuário → papel Titan (`packages/auth/src/../session.ts`
  ou equivalente em `apps/console/lib/auth/session.ts`) — bounded context `identity`/
  `organization` ainda não modelado. Toda sessão válida com tenant ativo é tratada como
  `"titan.operations"` (mínimo necessário), nunca um papel mais privilegiado.
  `packages/auth/src/abilities.ts` ganhou `can(["create","update"], "reservation")` só para esse
  papel.
- Não existe tabela de cotações persistida — `quoteId` no `CreateReservationSchema` é só
  rastreabilidade, não uma chave de lookup; isso é aceitável porque o preço é sempre recalculado,
  nunca lido de volta de uma cotação armazenada.
- Nenhuma Server Action desta fase foi exercitada ponta a ponta contra um Postgres vivo — mesma
  limitação de Docker do Gap conhecido 2.

**Verificação real feita nesta sessão:** `pnpm turbo run typecheck` limpo nos 17 pacotes do
monorepo após cada passo; `next build` real de `apps/console` limpo após os Passos 3c, 4 e 5
(28 rotas geradas, incluindo `/calendario` e `/reservas/nova`). Nenhuma migration já commitada
foi alterada.

**Próximo passo (histórico):** rodar a suíte de concorrência e o seed contra um Postgres real
para fechar de fato o portão de saída da Fase 1 — segue pendente (Gap conhecido 2). Plan mode
para a Fase 2 foi feito; ver seção seguinte para o resultado.

## Fase 2 — Direto (storefront, checkout, 2 gateways sandbox, ledger básico, /aprovações)

Plano aprovado em plan mode (`docs/roadmap.md`, escopo: storefront, checkout, 2 gateways em
sandbox, ledger básico, `/aprovações`). Decisão do usuário sobre a pergunta 8 de
`docs/decisoes-de-negocio.md` (gateways de lançamento): **Asaas** (PIX/BRL) + **Stripe** (hóspede
estrangeiro) — agora confirmada, documento atualizado. Execução via 9 subagentes em 6 passos (2
seriais + 1 curto + 4 faixas paralelas + 1 serial + integração final feita diretamente).

**Passo 1 — `packages/domain`:** `packages/domain/src/ledger/` — `Account`, `LedgerEntry`,
`postDoubleEntry` (recusa qualquer conjunto de linhas que não feche por moeda — `UnbalancedEntryError`),
`entriesForPaymentCaptured`/`entriesForRefund` (regras puras de contabilização, I2/I3).
`packages/domain/src/approval/` — `ApprovalRequest` (12 tipos no union, só `refund` com lógica
real nesta fase), FSM `pending→approved|rejected|expired`, `approved→executed|failed`,
`rejectApproval` que lança `RejectionRequiresCommentError` sem comentário (seção 9.4.2: "nada de
aprovação por chat"). 16 testes novos (53 no total do pacote).

**Passo 2 — `packages/db`:** migration `0003_ledger_approvals_payments.sql` — `accounts`,
`ledger_entries` (append-only: `GRANT SELECT,INSERT` + `REVOKE UPDATE,DELETE,TRUNCATE` explícito,
mesmo padrão de `audit_log`), `payment_intents` (`idempotency_key` UNIQUE — âncora de I6),
`webhook_events` (`UNIQUE(gateway, external_event_id)`, deliberadamente SEM tenant_id/RLS — o
evento chega antes de sabermos o tenant), `approval_requests`. RLS+grants nas tabelas
tenant-scoped. Journal/snapshot via `drizzle-kit generate` real — as 4 migrations (0000-0003)
descobertas em ordem via `readMigrationFiles()`.

**Passo 3 — `packages/contracts`:** `CheckoutRequestSchema`/`CheckoutResponseSchema`,
`RefundRequestSchema`, `ApprovalDecisionSchema` (`.refine()` exige comentário quando
`decision==="reject"`, espelhando a regra de domínio na borda Zod).

**Passo 4 — 4 faixas paralelas:**
- **4a/4b — `packages/payments`:** interface `PaymentGatewayAdapter` comum (`port.ts`, escrita
  pela faixa Asaas) + adapters Asaas (PIX — `capture()` lança `NotSupportedByGatewayError`, PIX
  não tem captura tardia separada de autorização) e Stripe (cartão internacional, `capture_method:
  "manual"` para preservar o estado `authorized` de I2, `stripe.webhooks.constructEvent` para
  assinatura real). Coexistiram sem conflito real apesar de mexerem no mesmo pacote em paralelo —
  28 testes passando juntos. Testes de contrato contra fixtures, nunca rede real (sem contas
  Asaas/Stripe configuradas nesta máquina). Teste dedicado de I4 (varredura de padrão de PAN) em
  cada adapter.
- **4c — `apps/web`:** `PRODUCT.md`/`DESIGN.md` próprios (registro `brand`, paleta OKLCH distinta
  do cockpit — só o verde-acento Titan reaproveitado como fio de identidade). Rotas `/`,
  `/unidades`, `/unidades/[id]`, `/checkout`, `/reservas/[id]/confirmacao`. Nenhum campo de cartão
  renderizado (I4) — hosted fields como placeholder explícito até o gateway estar plugado (Passo
  6 fechou essa lacuna).
- **4d — `apps/console`:** fila real de `/aprovacoes` — lista `approval_requests` pendentes,
  aprovar sem etapa extra nesta fase, rejeitar exige comentário (garantido em 3 camadas: UI
  desabilita submit sem texto, Zod recusa, domínio lança `RejectionRequiresCommentError` se
  escapar). `packages/auth/src/abilities.ts` ganhou subject `"approval_request"` com
  `can(["read","approve"], "approval_request")` para `titan.finance`.

**Passo 5 — `apps/worker`:** endpoint HTTP (`node:http` puro, corpo lido como Buffer cru — crítico
para o HMAC do Stripe) em `POST /webhooks/:gateway` — verifica assinatura (401 se inválida, I6),
deduplica via `webhook_events` (`ON CONFLICT DO NOTHING`, I6), enfileira job BullMQ. Job resolve o
tenant do `payment_intent` via conexão administrativa (mesmo padrão do seed da Fase 1 — `titan`
bypassa RLS só para essa única consulta), valida a transição com `canTransitionPayment` (I2),
atualiza status e, ao chegar em `captured`, garante o plano de contas mínimo (`cash`/
`unit_revenue`/`gateway_fee_expense`, criado on-demand) e posta os lançamentos via
`entriesForPaymentCaptured`+`postDoubleEntry`, confirmando a reserva (`pending→confirmed`). 14
testes com repositórios fake (sem Postgres/Redis reais nesta máquina).

**Passo 6 — integração final (feita diretamente, reconciliando as 4 faixas):** `apps/web`'s
`createCheckoutAction` agora cria o `payment_intent` de verdade via `resolveGatewayAdapter`
(roteamento simples por método: PIX→Asaas, cartão→Stripe) **depois** que a reserva `pending` já
foi commitada (chamada de rede ao gateway nunca dentro de uma transação de banco aberta) — falha
do gateway nunca desfaz a reserva, só marca `pending_integration`. Página de confirmação mostra o
status real do `payment_intent` mais recente em vez da nota fixa de "pendente de integração".
Sem credenciais reais de Asaas/Stripe nesta máquina, todo checkout real cai em
`pending_integration` — comportamento correto e esperado, não um bug.

**Dívida técnica nova, documentada e não escondida:**
- A execução real de reembolso (chamar o adapter de gateway + postar `entriesForRefund` ao
  aprovar uma `approval_request` do tipo `refund`) **não foi wireada nesta rodada** — a Server
  Action de decisão (`apps/console/.../aprovacoes/actions.ts`) já transiciona o status e grava a
  decisão, mas a execução financeira fica como TODO explícito. Também não existe ainda nenhum
  fluxo de UI para ABRIR uma solicitação de reembolso (`RefundRequestSchema` existe em
  `packages/contracts` mas nenhuma Server Action a consome) — isso é trabalho de uma fase
  seguinte, quando o bounded context de atendimento/CRM ganhar uma tela de gestão de reserva
  individual.
- Dados do hóspede (`request.guest` do checkout) não têm onde persistir — `reservations` não tem
  coluna de hóspede (bounded context `crm`, fora do escopo de `packages/db` nesta fase).
- `requiredApprovals === 2` (dupla aprovação) não tem fluxo de segunda assinatura — uma única
  decisão já transiciona a solicitação para estado terminal. Fica para a Fase 5, junto com as
  Camadas 2-7 completas de `docs/adr/0005-orquestracao-de-pagamentos.md`.
- Taxa de gateway (`gatewayFeeAmountCents`) é assumida `0` no worker — `payment_intents` não tem
  coluna própria de taxa nesta fase; placeholder explícito, nunca um percentual inventado.
- `docs/runbook-pagamentos.md` (novo, Camada 0) tem todos os itens de configuração real de
  painel marcados `_pendente_` — bloqueiam processamento de pagamento real em produção, não o
  sandbox de desenvolvimento.
- Nenhuma chamada de rede real a Asaas/Stripe foi verificada nesta sessão (sem contas/credenciais
  configuradas) — mesma limitação já registrada nas fases anteriores para Docker, aplicada aqui a
  gateway de pagamento.

**Verificação real feita nesta sessão:** `pnpm turbo run typecheck` limpo nos 17 pacotes após cada
passo; `pnpm turbo run test` com todos os testes passando (53 domain + 28 payments + 14 worker +
6 auth, mais os já existentes de db/domain); `next build` real de `apps/web` (5 rotas) e
`apps/console` (28 rotas, sem regressão) após a integração final. Nenhuma migration já commitada
foi alterada.

**Próximo passo:** plan mode para a Fase 3 (Distribuição: iCal + agregador para os 4 canais,
ingestão, reconciliação) — depende da certificação/contrato de canal, que corre em paralelo
contínuo conforme `docs/roadmap.md`.
