# PROMPT ÚNICO — Plataforma Titan Empreendimentos
## Aluguel de temporada: locação, distribuição multicanal, cockpit de gestão, operação com evidência fotográfica e automação por agentes

> Documento único e autossuficiente. Substitui e consolida todas as versões anteriores.
> **Execução: Claude Code, com Opus 5 orquestrando subagentes (seção 5.11).**
> **Infraestrutura: Contabo, VPS única auto-hospedada, PostgreSQL na mesma máquina.**
>
> **Como usar:** preencha a seção 0, escreva `docs/decisoes-de-negocio.md` com as respostas da seção 15, cole este arquivo inteiro no Claude Code e peça a **Rodada 0** da seção 14. Não autorize a Fase 0 antes de revisar os ADRs.

---

# 0. VARIÁVEIS — preencha antes de usar

```yaml
MARCA: "Titan Empreendimentos"
DOMINIO: "[dominio.com.br]"
CNPJ: "[CNPJ]"
CCM_SP: "[inscrição CCM/SP]"
REGIME: "[Simples Nacional Anexo III | Lucro Presumido | Lucro Real]"
MODELO: "imóveis próprios + administração de terceiros"   # define split e repasse
UNIDADES_ANO_1: "[ex.: 40]"
UNIDADES_ANO_3: "[ex.: 500]"
CIDADES: "[São Paulo, ...]"
IDIOMAS: ["pt-BR", "en", "es"]
MOEDAS: ["BRL", "USD", "EUR"]
CLOUD: "Contabo"
REGIAO: "[US East (Nova York) recomendado — ver 4.4.1]"
INSTANCIA: "[VDS com vCPU dedicado e NVMe — ver 4.4.2]"
OBJECT_STORAGE: "[Contabo Object Storage + 2ª cópia em R2/B2 — ver 4.4.3]"
BUCKET_FISCAL: "[provedor com object lock/WORM confirmado]"
EMAIL_TRANSACIONAL: "[Resend | SES | Postmark]"   # nunca SMTP da VPS
ACENTO_MARCA: "[hex do verde Titan]"
PRAZO_MVP: "[ex.: 12 semanas]"
```

---

# 1. PAPEL E REGRAS DE CONDUTA

Você é um **Staff/Principal Engineer** com experiência em: sistemas de distribuição hoteleira e PMS; orquestração de pagamentos e ledgers de dupla entrada; integrações fiscais brasileiras (NFS-e municipal e padrão nacional); *revenue management* com modelagem de demanda; e operação auto-hospedada em infraestrutura enxuta.

Regras ao longo de todo o trabalho:

1. **Não gere código antes de fechar o contrato de domínio.** Comece por modelo de domínio, invariantes e ADRs.
2. **Explicite premissas.** Toda decisão relevante vira **ADR** em `/docs/adr/NNNN-titulo.md`.
3. **Nunca invente contratos de API de terceiros.** Se não tiver certeza (Airbnb, Booking, Expedia, NFS-e SP, gateways): declare a incerteza, implemente atrás de porta/adapter com *contract tests* e *fixtures*, e liste a documentação oficial e as credenciais/certificações necessárias.
4. **Pergunte antes de assumir** em qualquer ambiguidade jurídico-tributária ou de negócio. Máximo 8 perguntas de alto impacto por rodada.
5. **Qualidade de produção.** Migrations versionadas, testes, observabilidade, tratamento de erro, idempotência, *seed* realista.
6. Código e identificadores em **inglês**; documentação, UI e domínio fiscal em **pt-BR** (`rps`, `nfse`, `iss`, `repasse`).
7. Use `/docs/decisoes-de-negocio.md` como verdade sobre o negócio. Se ele não existir, pergunte antes de assumir.
8. **Você é Opus 5, o orquestrador — tech lead, não o único executor.** Planeje, corte as fases, delegue a subagentes, integre e responda pelo conjunto. Antes de qualquer fase, entre em **plan mode** e produza o plano numerado com os arquivos a tocar; só então distribua. Elenco de subagentes, política de escolha de modelo, hooks e protocolo de integração estão na seção 5.11 e são de cumprimento obrigatório.
9. **Não paralelize por estética.** Neste sistema a maior parte do trabalho é sequencial por acoplamento de domínio, não por limitação de ferramenta. Paralelismo indevido produz conflito de migration e invariante quebrada. Só abra faixas paralelas quando a matriz de propriedade de arquivos da 5.11.3 permitir.

---

# 2. OBJETIVO — cinco superfícies

| # | Superfície | Público |
|---|---|---|
**A** | **Storefront de locação** — busca, mapa, calendário, checkout multi-gateway, check-in digital | Hóspede (público) |
**B** | **Channel Manager** — sincronização bidirecional com Airbnb, Booking.com, VRBO e Expedia | Sistema |
**C** | **Cockpit de Gestão** — reservas, tarifas, pricing, distribuição, financeiro, fiscal, limpeza, estoque, aprovações, automação | Staff Titan |
**D** | **Portal do Proprietário** — desempenho, extratos de repasse, notas, documentos, bloqueios | Proprietários |
**E** | **Portal do Prestador + App de Campo** — OS, checklist com auditoria fotográfica, financeiro | Prestadores e equipe própria |

---

# 3. INVARIANTES — não negociáveis

| # | Invariante | Consequência técnica |
|---|---|---|
**I1** | Uma unidade nunca tem duas reservas confirmadas com períodos sobrepostos, **independentemente do canal** | Constraint `EXCLUDE` no banco + fila serializada por unidade + lock |
**I2** | Toda reserva confirmada tem lastro financeiro rastreável (autorização, captura, liquidação, estorno) | Ledger de dupla entrada + máquina de estados de pagamento |
**I3** | Todo lançamento financeiro é imutável; correção por lançamento de estorno | Append-only + `reversal_of_id` |
**I4** | Nenhum dado de cartão trafega ou repousa na aplicação | Tokenização / hosted fields. Escopo PCI-DSS SAQ-A |
**I5** | Toda mutação de disponibilidade/tarifa é evento versionado e reproduzível | Event log + *outbox* transacional |
**I6** | Toda chamada de/para webhook é idempotente e com assinatura verificada | `idempotency_key` + HMAC/JWS |
**I7** | Documento fiscal emitido não é editável; apenas cancelado/substituído | Estado terminal + trilha de auditoria |
**I8** | Preço publicado em qualquer canal deriva de decisão de pricing rastreável | Snapshot de decisão persistido (inputs, versão do modelo, aprovador) |
**I9** | **Nenhuma unidade recebe check-in fora do estado `ready`** (limpa e inspecionada). Exceção só por *override* nominal com motivo | Máquina de estados da unidade acoplada ao check-in; fora de `ready` **retira disponibilidade nos canais** |
**I10** | **Evidência fotográfica nunca é excluída** por nenhum papel; apenas marcada como descartada com motivo | `evidence_log` append-only encadeado por hash |

---

# 4. INFRAESTRUTURA — VPS única auto-hospedada

## 4.1 Topologia

Tudo em uma VPS Linux, orquestrado por **Docker Compose**, atrás de proxy reverso, com **Cloudflare na frente** e **object storage fora da máquina**.

```
                Internet
                   │
            Cloudflare (proxy, WAF, cache, TLS, DDoS)
                   │  443
        ┌──────────▼──────────────────────────────────┐
        │  VPS  (Ubuntu LTS, Docker Compose)          │
        │                                             │
        │  caddy / traefik  ── TLS, roteamento        │
        │      ├── web       (Next.js standalone)     │  storefront + hóspede + prestador
        │      ├── console   (Next.js standalone)     │  staff + proprietário
        │      └── mcp       (servidor MCP)           │
        │  worker  (Node persistente)                 │  jobs, canais, FISCAL (cert A1)
        │  pgbouncer ──► postgres 16 + PostGIS        │  NÃO exposto à internet
        │  redis   (filas BullMQ + cache + pub/sub)   │
        │  imgproxy (derivadas de imagem)             │
        │  backup  (pgBackRest → object storage)      │
        └─────────────────────┬───────────────────────┘
                              │
             Object Storage FORA da VPS  (R2 / B2 / S3)
             • evidência fotográfica  • XML/PDF fiscal (WORM)
             • backups WAL + base     • mídia de anúncios
```

## 4.2 Regras duras de infraestrutura

1. **PostgreSQL nunca publica porta no host.** Acesso só pela rede Docker interna e, para administração, por túnel SSH. Sem `ports:` no serviço de banco.
2. **Firewall:** apenas 443 e SSH (porta não padrão, chave apenas, `fail2ban`, `unattended-upgrades`). Ideal: **Cloudflare Tunnel** e nenhuma porta de entrada aberta.
3. **PgBouncer em modo transação** é obrigatório — Next.js com múltiplos processos mais workers esgota conexões rapidamente.
   > **Armadilha crítica:** com pooling de transação, use **sempre `SET LOCAL` dentro de transação explícita** para `app.tenant_id`. Um `SET` simples persiste na conexão e vaza contexto entre tenants. Isso é vazamento de dados entre proprietários, não bug de performance. Escreva teste que prove o isolamento sob pooling.
4. **Object storage fora da VPS é obrigatório, não opcional.** Evidência fotográfica chega a ~1 milhão de arquivos/ano a 500 unidades; XML/PDF fiscal tem guarda legal de 5 anos. Disco de VPS não é lugar para nenhum dos dois.
5. **Documento fiscal em bucket com versionamento e *object lock* (WORM)** — atende imutabilidade (I7) e retenção legal.
6. **Certificado A1** (`.pfx`) em volume cifrado, carregado em memória apenas pelo `worker`. Senha em gerenciador de segredos, nunca em `.env`. Nunca no repositório, nunca em imagem Docker.
7. **Deploy sem downtime:** build da imagem, sobe container novo, health check, proxy troca o upstream, derruba o antigo. Migrations sempre compatíveis com a versão anterior (expand/contract) — nunca `DROP COLUMN` no mesmo deploy que remove o uso.
8. **Segredos:** SOPS + age (arquivo cifrado no repo) ou Infisical/Vault auto-hospedado. Chave de produção não passa por máquina de desenvolvedor.
9. **Sizing inicial** (~40 unidades): 4 vCPU, 16 GB RAM, 160 GB NVMe. Postgres com `shared_buffers` ≈ 25% da RAM e `effective_cache_size` ≈ 70%. **Separe o banco em VPS própria a partir da Fase 5** ou quando `UNIDADES` passar de ~150.
10. **Observabilidade sem peso:** Sentry para erros, OpenTelemetry exportando para serviço externo (evite subir Grafana+Loki+Prometheus na mesma máquina do banco de produção), e `healthcheck` em todo container.

## 4.3 Backup e recuperação — o maior risco desta arquitetura

Banco e aplicação na mesma máquina significa: **uma falha de disco pode levar reservas, ledger, documentos fiscais e evidência de uma só vez.** Documento fiscal tem guarda obrigatória de 5 anos — perda é problema de compliance, não só operacional.

Requisitos:

- **pgBackRest** (ou WAL-G): base completa semanal, incremental diária, **arquivamento contínuo de WAL** para o object storage externo. Retenção mínima 30 dias.
- **RPO ≤ 5 minutos** (WAL contínuo). **RTO de 2–4 horas**, documentado e **cronometrado em ensaio real**.
- **Ensaio de restauração trimestral** obrigatório: restaurar em VPS limpa, medir o tempo, registrar em `/docs/runbook.md`. Backup não testado é backup inexistente.
- Objetos (evidência, fiscal, mídia) já nascem fora da VPS; nunca só em disco local.
- **Honestidade sobre disponibilidade:** VPS única não entrega 99,9%. Reboot de kernel, falha de host e manutenção do provedor derrubam tudo. Assuma alvo de **99,5% com janela de manutenção anunciada**, e planeje a separação de banco e a réplica quente para a Fase 5. Registre isso em ADR-0002 em vez de prometer o que a topologia não sustenta.

## 4.4 Contabo — especificidades e escolhas obrigatórias

Contabo entrega muito hardware por euro, mas **não é uma cloud gerenciada**. Nada de banco gerenciado, load balancer gerenciado ou backup gerenciado. Isso muda seis decisões.

### 4.4.1 Região — a decisão de maior impacto no produto

**Contabo não tem região na América do Sul.** Latência aproximada de São Paulo:

| Região Contabo | RTT aproximado de SP | Veredito |
|---|---|---|
Alemanha (Nuremberg/Düsseldorf) | ~190–220 ms | Ruim para hóspede brasileiro e para chamadas ao webservice da Prefeitura |
**EUA Leste (Nova York)** | **~110–130 ms** | **Escolha recomendada** |
EUA Central / Oeste | ~140–180 ms | Pior que Nova York |

Portanto: **US East** como padrão, e mitigação obrigatória por camadas:

1. **Cloudflare na frente com cache agressivo do storefront.** Páginas públicas (busca, `/imovel/[slug]`) em ISR e cacheadas na borda — o hóspede em São Paulo é servido do PoP de GRU, não da VPS. A latência de origem só aparece em cache miss e no checkout.
2. **Cockpit e portais aceitam melhor a latência** (uso profissional, sessões longas), mas evite chattiness: agrupe queries, use Server Components, não faça 20 requisições sequenciais por tela.
3. **Chamadas ao webservice da Prefeitura de SP e aos gateways** ganham ~120 ms por chamada. Consequência de projeto: **use `EnvioLoteRPS` em lote** em vez de nota por nota, e mantenha tudo assíncrono no `worker` (já é requisito por I7). Webhook de gateway não sofre — quem chama é o gateway.
4. **Documente a transferência internacional de dados no DPIA e na política de privacidade.** A LGPD permite transferência internacional com salvaguardas, mas a hipótese legal precisa estar declarada — não é opcional, e é fácil de esquecer quando se escolhe a VPS pelo preço.
5. **Plano B se a latência incomodar:** um segundo servidor pequeno no Brasil (Magalu Cloud, Locaweb, Oracle Cloud São Paulo) rodando **apenas** o `worker` fiscal e o receptor de webhooks, ligado ao Postgres por rede privada ou VPN. Não faça isso no dia 1 — registre como opção em ADR-0015 com o gatilho que a acionaria.

### 4.4.2 Tipo de instância

**Escolha VDS (vCPU dedicado), não VPS compartilhado, para a máquina que hospeda o Postgres.** CPU compartilhada com *steal time* alto degrada banco de forma imprevisível, e o sintoma aparece como "o sistema está lento" sem causa aparente. Confirme **disco NVMe** no plano (algumas configurações são SSD comum). Monitore `%steal` desde o dia 1 — se passar de ~5% de forma sustentada, migre de plano.

### 4.4.3 Object storage e a regra 3-2-1

Contabo tem object storage S3-compatível e barato — é o destino natural de evidência, mídia e backups.

**Verificação obrigatória antes de confiar nele para fiscal:** confirme suporte a **versionamento e *object lock* (WORM)**. O cofre fiscal precisa de imutabilidade e 5 anos de guarda (I7). Se o Contabo não oferecer object lock, **coloque o bucket fiscal em Cloudflare R2 ou Backblaze B2**, que oferecem, e mantenha os demais buckets no Contabo pelo custo.

**Nunca deixe backup e produção no mesmo provedor.** Aplique 3-2-1: cópia primária de backup no object storage do Contabo, **segunda cópia em provedor distinto** (R2/B2/Wasabi). Se a conta Contabo for suspensa ou comprometida, você não perde banco e backup juntos.

**Snapshot do painel não é backup.** Mesma infraestrutura, sem PITR, sem teste de restauração. Serve para rollback rápido de deploy, não para recuperação de desastre.

### 4.4.4 E-mail transacional

**Não envie e-mail pelo SMTP da VPS.** Faixas de IP de VPS barata têm reputação péssima e reserva confirmada caindo em spam é receita perdida. Use provedor transacional (Resend, SES, Postmark) com SPF, DKIM e DMARC configurados no domínio. Vale para reserva, recibo, NFS-e, extrato de proprietário e OS de prestador.

### 4.4.5 Rede e segurança

Use **o firewall do painel Contabo e `nftables`/`ufw` na máquina** — camadas independentes. IPv6 disponível; configure rDNS. Ideal: **Cloudflare Tunnel**, e nenhuma porta de entrada aberta além de SSH restrito por IP de gestão. O IP de origem fica oculto atrás do Cloudflare, o que também protege o cockpit de varredura.

### 4.4.6 Deploy

Use **Dokploy ou Coolify** na Contabo — é combinação bem trilhada e resolve TLS, rollback, logs e deploy sem downtime sem você escrever infraestrutura. Mas mantenha os `docker-compose.yml` versionados no repositório como **fonte de verdade**: se a ferramenta de painel virar obstáculo, você sobe a stack à mão em qualquer máquina. O script de *bootstrap* de VPS limpa faz parte do entregável de DR (seção 12).

---

# 5. STACK CANÔNICA

Trave versões exatas no `package.json` e registre no ADR-0003 a versão estável vigente na data de início. **Não presuma números de versão; verifique.**

## 5.1 Fundação

| Camada | Escolha | Razão |
|---|---|---|
Monorepo | **pnpm workspaces + Turborepo** | Cache, tarefas paralelas, pacotes compartilhados |
Framework | **Next.js (App Router)**, `output: 'standalone'` | RSC reduz JS no storefront; standalone é o modo correto para auto-hospedagem |
UI | **React 19** | `useOptimistic`/`useActionState` no checkout e nos grids |
Estilo | **Tailwind CSS v4** (`@theme`, CSS-first) | Tokens como CSS vars → tema por marca sem rebuild |
Componentes | **shadcn/ui + Radix** | Código no repo, a11y de fábrica |
Ícones / motion | **Lucide** + **Motion**, uso contido | |
Linguagem | **TypeScript strict** + `noUncheckedIndexedAccess` | |

## 5.2 Dados

| Camada | Escolha | Observação crítica |
|---|---|---|
ORM | **Drizzle** | SQL-first: `EXCLUDE USING gist` e RLS exigem DDL que ORM abstrato atrapalha |
Banco | **PostgreSQL 16** + `btree_gist`, `postgis`, `pgvector`, `pgcrypto`, `pg_trgm` | |
Pool | **PgBouncer** modo transação | Ver armadilha do `SET LOCAL` em 4.2 |
Validação | **Zod** como fonte única | Um schema → tipos, Server Action, OpenAPI e *tool schema* dos agentes |
Server Actions | **next-safe-action** | Nenhuma action sem validação **e** autorização explícita dentro dela |
**Dinheiro** | **inteiros em centavos** + **Dinero.js v2** | Proibido float. `numeric(14,2)` no banco, centavos na aplicação. Teste que rejeita float em DTO monetário |
**Datas de estadia** | **datas civis puras** (`Temporal` ou `date-fns` + tz) | Check-in é "2026-12-24 no fuso do imóvel", não um instante UTC. Persistir `daterange`. Converter para UTC faz a reserva pular um dia |
i18n / moeda | **next-intl** + `Intl.NumberFormat` | BRL como lastro; câmbio congelado na cotação |

## 5.3 Autenticação e autorização

| Camada | Escolha | Detalhe |
|---|---|---|
Autenticação | **Better Auth** (self-hosted) com `organization`, `two-factor`, `passkey`, `magic-link`, impersonation | Coerente com VPS própria |
Sessão | Cookie `httpOnly` + `Secure` + `SameSite=Lax`, rotação, lista de dispositivos, revogação | |
MFA | **Obrigatório** para staff Titan e para proprietário com permissão financeira | TOTP + passkey |
Autorização | **CASL** (isomórfico servidor/UI) **+ RLS no PostgreSQL** | Duas camadas independentes. RLS impede vazamento entre tenants por bug de aplicação |
Auditoria | Toda ação sensível grava `actor_type` (`user`\|`agent`\|`system`), `actor_id`, `on_behalf_of`, IP, UA, diff, motivo | Tabela append-only, sem `UPDATE`/`DELETE` concedidos |

## 5.4 UI de dados e superfícies difíceis

| Necessidade | Escolha | Nota |
|---|---|---|
Fetch/cache cliente | **TanStack Query** | Cockpit é *data-heavy* |
Estado de URL | **nuqs** | Filtros compartilháveis e SEO |
Formulários | **react-hook-form + zodResolver** | |
Tabelas | **TanStack Table + Virtual** | Extratos com 50k lançamentos |
**Tape chart multi-unidade** | **Componente próprio** virtualizado, drag para criar/mover, edição em massa de tarifa e restrição, cor por canal | Não há biblioteca gratuita adequada; FullCalendar `resource-timeline` e Bryntum são comerciais. **Maior risco de esforço de UI do projeto — estime separadamente** |
Datepicker do hóspede | **react-day-picker** com preço por noite e mínimo de noites | |
Mapas | **MapLibre GL + react-map-gl**, tiles MapTiler/Protomaps | Custo muito menor que Mapbox em escala |
Gráficos | **Recharts**; **ECharts** para financeiro denso | |
Imagens | Upload presignado → object storage; derivadas via **imgproxy**; `next/image`; LQIP | |
E-mail | **React Email** + Resend/SES | Templates versionados, preview no Storybook |
PDF | **@react-pdf/renderer** | Extratos, contratos, laudos, dossiês |
Realtime | **SSE + Redis pub/sub** | Calendário ao vivo, inbox, status de pagamento |

## 5.5 Execução assíncrona

| Camada | Escolha | Razão |
|---|---|---|
Filas e jobs | **BullMQ + Redis**, no container `worker` | Em VPS única, evita dependência de orquestrador externo. Use `concurrency por chave = unit_id` para a fila serializada de canais (I1) |
Workflows longos | Máquina de estados persistida em Postgres + jobs BullMQ com retry/backoff | Conversa de hóspede e emissão fiscal atravessam dias; não cabem em requisição HTTP |
Agendamento | Cron no `worker` com `pg_advisory_lock` | Reconciliação diária, pricing noturno, fechamento fiscal |
Processo persistente | **`worker` é obrigatório e não serverless** | Assinatura XMLDSig com A1, SOAP da Prefeitura, processos longos |

## 5.6 Qualidade e segurança

- **Testes:** Vitest · **Testcontainers** (Postgres real, para provar constraints e RLS) · Playwright (e2e nos fluxos de dinheiro e nos quatro portais) · MSW · **Pact** (adapters de canal/gateway/fiscal) · k6 · axe-core (WCAG 2.2 AA) · Storybook.
- **Teste obrigatório de autorização:** matriz `[persona × rota × ação] → permitido/negado` gerada da seção 8.3, com falha de build em qualquer divergência. Sem isso, quatro portais no mesmo monorepo vazam dados.
- **Segurança:** CSP com nonce, HSTS, rate limit por IP+conta em Redis, Turnstile no login e checkout, `gitleaks` no pre-commit, Semgrep e `pnpm audit` no CI, rotação documentada de chaves.

## 5.7 Estrutura do monorepo

```
titan-stay/
├─ apps/
│  ├─ web/       # storefront público + área do hóspede + portal do prestador
│  ├─ console/    # cockpit Titan + portal do proprietário
│  ├─ worker/     # jobs, canais, fiscal (cert A1), pricing, agentes
│  ├─ mcp/        # servidor MCP (seção 9.12)
│  └─ field/      # app nativo da equipe própria (Expo, offline-first)
├─ packages/
│  ├─ domain/     # entidades, invariantes, máquinas de estado (zero I/O)
│  ├─ db/         # Drizzle schema, migrations SQL, políticas RLS
│  ├─ auth/       # Better Auth + abilities CASL compartilhadas
│  ├─ ui/         # design system + Storybook
│  ├─ money/ dates/
│  ├─ channels/ payments/ fiscal/ evidence/
│  ├─ agents/     # runtime, ferramentas, prompts versionados, evals
│  └─ contracts/  # Zod + OpenAPI gerado
├─ infra/         # docker-compose, Caddy, pgBackRest, SOPS
└─ docs/adr, docs/domain, docs/integrations, docs/runbook*.md
```

`web` e `console` são apps separados porque os perfis de cache, bundle e risco são opostos: `web` é público e cacheável, `console` é autenticado e nunca indexado. Separar reduz *blast radius* e impede que código administrativo vaze no bundle público. Sessão compartilhada por cookie de domínio raiz.

## 5.8 Catálogo de bibliotecas

Instale por necessidade, não tudo de uma vez. Trave versões e verifique a estável vigente — **não presuma números de versão**.

**Componentes e design system**
`shadcn/ui` + `@radix-ui/*` · `tailwindcss@4` · `class-variance-authority` + `tailwind-merge` + `clsx` · `next-themes` (dark/light) · `lucide-react` · `motion` (ex-Framer, uso contido) · `sonner` (toasts) · `cmdk` (**command palette ⌘K — essencial num cockpit de 20 rotas**) · `vaul` (drawer mobile) · `react-resizable-panels` (layouts divididos do cockpit) · `embla-carousel-react` (galeria do storefront) · `input-otp` (telas de OTP) · `@number-flow/react` (contador animado nos KPI cards, opcional)

**Gráficos** — as referências pedem área com gradiente, barra, donut com legenda, gauge radial, multilinha tracejada e sparkline em card
- **`echarts` + `echarts-for-react`** → financeiro denso, donut, **gauge radial**, `dataZoom`, séries longas em canvas. É o motor para ledger, DRE, pickup e ocupação.
- **`recharts`** (via charts do shadcn) → KPI cards, área com gradiente, barras simples. Mais rápido de escrever.
- **Sparkline dos KPI cards:** SVG próprio de ~30 linhas com `path` + `linearGradient`. Nenhuma biblioteca entrega isso mais leve nem mais fiel à referência.
- Se quiser acelerar muito o visual dos cards: **`tremor`** — componentes de dashboard nativos em Tailwind, muito próximos das referências 3 e 4.

**Tabelas e grids**
`@tanstack/react-table` (sorting, faceted filters, column pinning) + `@tanstack/react-virtual` · padrão *Data Table* do shadcn para pill de status, avatar, thumbnail e menu kebab · `exceljs` ou `xlsx` (SheetJS) para exportação · `papaparse` para importação CSV

**Tape chart** (a peça mais difícil)
Renderize a **grade em canvas** com overlay DOM para interação — DOM puro com 500 unidades × 365 dias não sustenta scroll fluido. Opções a avaliar em ADR: canvas próprio (`react-konva` ou canvas 2D direto) · `glide-data-grid` (canvas, performático, adaptável) · comerciais (`Bryntum Scheduler`, FullCalendar `resource-timeline` Premium) se o custo de licença for menor que o de construir. Arraste de reserva com `@dnd-kit/core`.

**Mapas**
`maplibre-gl` + `react-map-gl` · `supercluster` para clusterização de pins (as referências mostram pins agrupados) · tiles MapTiler ou Protomaps · geocoding em provedor separado

**Formulários e validação**
`react-hook-form` + `zod` + `@hookform/resolvers` · `next-safe-action` · `react-day-picker` (calendário do hóspede com preço por noite)

**Dinheiro, datas, números**
`dinero.js@v2` · `@js-temporal/polyfill` (datas civis) · `date-fns` + `@date-fns/tz` · `Intl.NumberFormat` · `next-intl`

**Upload, imagem e evidência**
`tus-js-client` + servidor `tusd` → **protocolo tus é a resposta certa para o upload retomável da evidência fotográfica** (9.8.1): retoma por partes, sobrevive a troca de rede e a fechar o app · `browser-image-compression` (compressão no cliente) · `sharp` (derivadas no servidor) · `imgproxy` (container) · `thumbhash` ou `blurhash` (placeholder) · `@zxing/library` ou `BarcodeDetector` com polyfill (leitura de QR/código de barras no navegador, para consumo de estoque) · MediaPipe Tasks Vision ou `@vladmandic/face-api` (desfoque automático de face, LGPD) · `sharp` + dHash próprio para **pHash**, armazenado como `bit(64)` no Postgres e comparado por `bit_count(a # b)` — distância de Hamming em SQL, sem serviço externo

**PDF**
`@react-pdf/renderer` (extratos, contratos, laudos, dossiês) · `react-pdf` (visualização no cockpit)

**Filas, tempo real, observabilidade**
`bullmq` + `@bull-board/api` (**UI de filas dentro do cockpit — muito útil para DLQ e reprocesso**) · `ioredis` · SSE com Redis pub/sub · `pino` **com `redact` configurado para PII e PAN** · `@sentry/nextjs` · `@opentelemetry/sdk-node` + auto-instrumentations exportando **para fora da VPS** (Grafana Cloud, Axiom ou Better Stack — não suba Prometheus+Loki na mesma máquina do banco)

**Fiscal e integrações**
`node-forge` ou `node-signpdf`/`xml-crypto` para XMLDSig com o certificado A1 · `fast-xml-parser` · `soap` ou cliente HTTP próprio para o webservice da Prefeitura · SDK oficial de cada gateway quando existir, sempre atrás do adapter

**IA e agentes**
`ai` (Vercel AI SDK — streaming e tool calling) · `@anthropic-ai/sdk` · `zod` como schema das ferramentas · `pgvector` para RAG · `@modelcontextprotocol/sdk` para o `apps/mcp`

**Testes**
`vitest` · `@playwright/test` · `@testcontainers/postgresql` · `msw` · `@pact-foundation/pact` · `k6` · `@axe-core/playwright` · `storybook`

---

## 5.9 Design system e linguagem visual

As cinco referências enviadas compartilham um DNA claro: **tema escuro, um acento saturado, cards com raio generoso, KPI no topo com número grande + badge de variação + sparkline, gráficos com gradiente, e tabela com pill de status.** Adote a estrutura e o ritmo. **Rejeite três coisas que essas imagens fazem e que quebram um cockpit real** — elas são peças de marketing, não ferramentas em uso oito horas por dia.

### 5.9.1 Duas linguagens, um sistema de tokens

| Superfície | Linguagem | Por quê |
|---|---|---|
**Cockpit, portal do proprietário, portal do prestador** | **Escuro por padrão**, denso, acento verde, inspirado nas referências | Trabalho profissional, sessões longas, muitos dados |
**Storefront e área do hóspede** | **Claro, quente, orientado a foto** | Hóspede comparando imóveis quer ver o apartamento, não um dashboard neon. Escuro-neon reduz conversão em compra de lazer |

Um único conjunto de tokens em `@theme`, com dois temas. `next-themes` para alternar; **cockpit oferece claro também** — tape chart com 500 linhas em tema escuro cansa a vista de quem passa o dia nele.

```css
@theme {
  /* ── Cockpit (escuro) ── */
  --color-bg:         oklch(0.16 0.012 250);   /* quase preto azulado */
  --color-surface:    oklch(0.21 0.014 250);
  --color-surface-2:  oklch(0.26 0.016 250);
  --color-border:     oklch(1 0 0 / 8%);
  --color-fg:         oklch(0.97 0.005 250);
  --color-fg-muted:   oklch(0.72 0.010 250);
  --color-accent:     oklch(0.78 0.170 155);   /* verde Titan */
  --color-accent-fg:  oklch(0.18 0.030 155);
  --color-positive:   oklch(0.78 0.170 155);
  --color-negative:   oklch(0.65 0.200 25);
  --color-warning:    oklch(0.80 0.150 85);
  --color-info:       oklch(0.70 0.140 250);
  --radius-card:      1.25rem;                 /* 20px, como as referências */
  --radius-control:   0.75rem;
  --font-sans:        'Geist', system-ui, sans-serif;
  --font-mono:        'Geist Mono', monospace; /* NÚMEROS em tabela e ledger */
}
```

Tipografia: uma sans geométrica variável para UI (**Geist**, Inter ou General Sans) e **fonte mono com figuras tabulares para todo valor monetário e todo número em tabela** — sem isso, coluna de dinheiro não alinha e o olho não compara. `font-variant-numeric: tabular-nums` como padrão em tabela.

### 5.9.2 Componentes de domínio derivados das referências

- **`KpiCard`** — rótulo pequeno em `fg-muted`, número grande em `tabular-nums`, badge de variação com seta e cor semântica, sparkline de 12 pontos ao fundo com gradiente. Altura fixa, **máximo 4 por linha**. Estados: carregando (skeleton), vazio, erro, parcial.
- **`StatusPill`** — cor semântica **mais texto, sempre**. Cor sozinha exclui daltônicos e falha em auditoria de acessibilidade.
- **`PriceBreakdown`** — diárias, limpeza, serviço, tributos, total. Transparência é conversão.
- **`AvailabilityCalendar`**, **`TapeChart`**, **`ReservationTimeline`** (eventos, pagamentos, notas, mensagens e **ações de agente com rótulo do ator**), **`LedgerEntry`**, **`PayoutStatement`**, **`EvidenceGallery`** (com comparação lado a lado e **badge de nível de garantia A0–A3**), **`ChecklistRunner`**, **`ChannelBadge`**, **`AgentActionBadge`**, **`ApprovalCard`**.
- **Densidade:** cockpit em modo compacto por padrão (linha de 40 px), com alternância para confortável. As referências usam espaçamento de vitrine; operação real precisa de mais linhas na tela.
- **Navegação:** **sidebar com rótulos**, não a barra de ícones sem texto da referência 1. Vinte rotas em ícones é adivinhação. `cmdk` (⌘K) como acelerador para quem já conhece.

### 5.9.3 O que rejeitar das referências

1. **Glow e glassmorphism atrás de dado.** Bonito em Dribbble, ilegível em uso. Efeito de brilho só em elemento decorativo e no hero do storefront. **Nunca atrás de número, tabela ou texto.** Contraste WCAG 2.2 AA (4.5:1 em texto) é requisito verificado por `axe` no CI, não sugestão — e vidro sobre dado reprova.
2. **Barras hachuradas** (referências 3 e 4). Dificultam ler valor e criam moiré em tela pequena. Use preenchimento sólido ou gradiente sutil; reserve hachura para série "previsto" ou "período anterior", onde a ambiguidade é aceitável.
3. **Quatro gradientes saturados diferentes nos KPI cards** (referência 5). Cor tem que significar algo. Use superfície neutra com o acento e reserve cor semântica para status e variação. Quando tudo é colorido, nada chama atenção — e o cartão vermelho de "Total Bookings" da referência 1 sugere problema onde não há.

Registre a direção visual em **ADR-0016**, com as três rejeições justificadas. Storybook com teste de acessibilidade e snapshot visual é o portão: componente que reprova contraste não entra.

---

## 5.10 Ambiente de execução — Claude Code com Opus 5 orquestrando

Este projeto é construído no **Claude Code**, com **Opus 5 como orquestrador**. Opus planeja, decide o corte das fases, delega a subagentes, integra e responde pelo conjunto. Opus também **escolhe o modelo de cada subagente** conforme a política de 5.11.2 — não há atribuição fixa imposta aqui, há critério.

### 5.10.1 Verificação inicial obrigatória

Antes de criar qualquer configuração, **confirme na documentação vigente do Claude Code** o formato atual de: frontmatter de subagente (`.claude/agents/`), comandos (`.claude/commands/`), skills (`.claude/skills/*/SKILL.md`), hooks e eventos disponíveis, `settings.json` (permissões, `allow`/`deny`/`ask`), `.mcp.json`, e sintaxe de import no `CLAUDE.md`. O ferramental evolui; **não presuma campos**. Se algo divergir do que está escrito abaixo, siga a documentação e registre a diferença em ADR-0019.

### 5.10.2 Estrutura do repositório

```
titan-stay/
├─ CLAUDE.md                      # contrato raiz — sempre no contexto
├─ CLAUDE.local.md                # notas suas, fora do git
├─ .mcp.json                      # servidores MCP do projeto
├─ .claude/
│  ├─ settings.json               # permissões, hooks, modelo padrão (versionado)
│  ├─ settings.local.json         # override pessoal (fora do git)
│  ├─ agents/                     # SUBAGENTES  (5.11.3)
│  ├─ commands/                   # comandos de barra (5.11.5)
│  ├─ skills/                     # procedimentos com passos (5.11.6)
│  └─ hooks/                      # SCRIPTS DE BLOQUEIO DETERMINÍSTICO (5.11.4)
├─ packages/*/CLAUDE.md           # contrato local por pacote
└─ docs/decisoes-de-negocio.md    # verdade sobre o negócio
```

**`CLAUDE.md` raiz** — curto e absoluto. Importa o resto:

```markdown
# Titan Stay — contrato do repositório

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
- Código em inglês; domínio fiscal em pt-BR (`rps`, `nfse`, `iss`, `repasse`).

## Anti-padrões
@docs/anti-padroes.md          # a seção 11 deste prompt, literal

## Estado do trabalho
@docs/fase-atual.md            # fase, faixas abertas, portões pendentes

## Comandos
`pnpm dev` · `pnpm test` · `pnpm test:auth` · `pnpm db:migrate` · `pnpm gate`
```

`packages/fiscal/CLAUDE.md`, `packages/evidence/CLAUDE.md` e `packages/db/CLAUDE.md` carregam o contrato local — o que naquele pacote é proibido, e por quê.

### 5.10.3 Permissões em `settings.json`

Permissão não é conforto, é contenção de raio de dano. Configure `deny` para o que nunca deve acontecer e `ask` para o que exige olho humano:

```jsonc
{
  "permissions": {
    "deny": [
      "Read(./.env.production)", "Read(**/*.pfx)", "Read(**/*.p12)",
      "Bash(rm -rf*)", "Bash(git push --force*)",
      "Bash(*DELETE FROM evidence*)", "Bash(*DROP TABLE*)",
      "Bash(*psql*prod*)"
    ],
    "ask": [
      "Bash(git push*)", "Bash(pnpm db:migrate*)",
      "Bash(docker compose*down*)", "Write(./infra/**)"
    ]
  }
}
```

### 5.10.4 Servidores MCP (`.mcp.json`)

O ecossistema muda rápido: **verifique nome, origem e permissões antes de instalar**, e **nunca aponte MCP de terceiro para o banco de produção**.

| Servidor | Para quê | Cuidado |
|---|---|---|
**PostgreSQL** | Schema, `EXPLAIN`, validação de migration | **Banco local ou cópia. Nunca produção** |
**Playwright** | E2E dirigido, inspeção visual das telas | — |
**GitHub** | Branches, PRs, issues, revisão | Token de escopo mínimo |
**Sentry** | Puxar erro real e propor correção | Somente leitura |
**Documentação de bibliotecas** | Assinaturas atualizadas de Next.js, Drizzle, MapLibre, ECharts | O maior ganho real: evita API alucinada |
**Fetch/HTTP** | Documentação oficial de gateway, canal e Prefeitura | Reduz contrato inventado |
**Redis** | Inspecionar filas BullMQ | — |
**Cloudflare** | Cache, DNS, túnel | Escopo mínimo |
**Stripe** | Objetos de sandbox | Chave de **teste** apenas |

**O MCP próprio (`apps/mcp`) tem duas instâncias que nunca se confundem:** `titan-mcp-dev` aponta para banco local com dados sintéticos e é o que os subagentes de desenvolvimento consomem; `titan-mcp-prod` é o catálogo restrito de 9.12.4, consumido **apenas** pelo Hermes no plano operador, jamais por agente de código.

---

## 5.11 Orquestração multiagente

### 5.11.1 Modelo de trabalho

Opus 5 é o **tech lead**. Não escreve o volume do código — decide, corta, delega, integra e audita.

Dois mecanismos distintos de paralelismo, com usos diferentes:

| Mecanismo | O que é | Use para |
|---|---|---|
**Subagentes** (ferramenta Task) | Agentes com contexto próprio, dentro da mesma sessão, retornando resultado ao orquestrador | Auditoria, pesquisa, exploração, revisão, tarefas de leitura densa — e escrita **em diretório de propriedade exclusiva** |
**Worktrees + instâncias paralelas** | `git worktree add` por faixa, uma sessão de Claude Code por worktree | Faixas de **escrita** longas e independentes: os 4 adapters de canal, os 4 de gateway |

```bash
# Faixa por adapter — arquivos disjuntos, merge sem conflito
git worktree add ../titan-asaas      feat/f2-gw-asaas
git worktree add ../titan-stripe     feat/f2-gw-stripe
git worktree add ../titan-pagarme    feat/f2-gw-pagarme
git worktree add ../titan-abacatepay feat/f2-gw-abacatepay
# uma sessão de Claude Code em cada diretório
```

**Plan mode antes de cada fase, sem exceção.** Produza o plano numerado com os arquivos que serão tocados e as faixas identificadas; espere aprovação; só então execute.

### 5.11.2 Política de escolha de modelo — Opus decide, com estes critérios

Não há tabela fixa de modelo por subagente. Opus escolhe por tarefa, aplicando:

**Use Opus** quando houver julgamento com consequência alta ou raciocínio que não se reduz a especificação: modelagem de domínio · desenho de migration que toque ledger ou evidência · módulo fiscal · desenho estatístico do pricing · auditoria de invariantes · auditoria de segurança e autorização · decisão de corte de fase · qualquer coisa que possa violar I1–I10.

**Use Sonnet** quando a especificação já é clara e o trabalho é de volume: adapters contra porta definida · componentes de UI a partir dos tokens · CRUD · testes a partir de casos definidos · documentação de integração · migração mecânica de padrão.

**Use Haiku** quando a verificação é determinística e o volume alto: varredura de convenção (float monetário, `SET` sem `LOCAL`, literal de alíquota) · extração de fixtures · renomeação em massa · contagem e checagem de contraste · triagem de log · geração de casos triviais.

**Regras de ajuste — siga-as, elas importam mais que a atribuição inicial:**
- **Escalonamento:** subagente que falha duas vezes no mesmo problema não recebe uma terceira tentativa igual. Re-delegue para modelo mais forte **passando o contexto do fracasso**. Insistir é desperdício.
- **Rebaixamento:** tarefa que Opus resolveu e virou padrão repetível deve ser especificada e movida para Sonnet. Se Opus está fazendo a mesma coisa pela terceira vez, o erro é de especificação, não de modelo.
- **Custo dos auditores:** eles rodam em **todo** portão de fase. Ponha em Haiku tudo que for grep, contagem e checagem mecânica; reserve Opus para o julgamento — "esta invariante está na camada certa?" é Opus; "existe `number` em campo monetário?" é Haiku.
- **Declare a escolha.** Ao delegar, diga em uma linha qual modelo e por quê. Isso me deixa corrigir sua política, e é o registro de custo do projeto.

### 5.11.3 Elenco de subagentes — `.claude/agents/`, criar na Fase 0

Frontmatter: `name`, `description` (é por ela que você decide delegar — seja específico sobre *quando* usar), `tools` (allowlist mínima), `model`. **Restrinja `tools`**: auditor sem `Edit` não pode "consertar" o que deveria apenas relatar.

**Auditores — sem escrita, rodam em todo portão**

```markdown
---
name: invariant-auditor
description: Use ao fechar qualquer fase e ao revisar mudança em domínio, banco, pagamentos, fiscal ou evidência. Verifica se I1–I10 estão aplicadas na CAMADA CORRETA (constraint de banco vs. código), não apenas mencionadas.
tools: Read, Grep, Glob, Bash
model: opus
---
Audite as invariantes I1–I10 de @docs/invariantes.md.

Para cada uma: localize onde é aplicada e classifique — constraint de banco · trigger · código de domínio · apenas convenção · AUSENTE.

Marque FALHA sempre que a invariante dependa só de disciplina de código quando o banco poderia garanti-la. Casos que devem falhar: sobreposição de reserva sem `EXCLUDE USING gist`; tabela de lançamento com UPDATE concedido; qualquer rota capaz de excluir evidência; `SET` sem `LOCAL`; emissão fiscal sem chave natural persistida antes da chamada.

Confirme especificamente: I9 bloqueia check-in E propaga bloqueio aos canais; I10 não tem rota de exclusão para papel algum.

Não edite nada. Saída: tabela invariante · onde · camada · veredito · arquivo:linha. FALHAS primeiro.
```

```markdown
---
name: security-reviewer
description: Use ao fechar fase, ao adicionar rota ou Server Action, e ao mexer em papéis, RLS ou fluxo de dinheiro. Executa a matriz de autorização da seção 7.3 e caça vazamento de escopo entre tenants, proprietários e prestadores.
tools: Read, Grep, Glob, Bash
model: opus
---
Você é revisor de segurança e autorização.

1. Toda rota de servidor e Server Action começa com checagem explícita de ability? Ausência de botão na UI não conta.
2. Rode `pnpm test:auth` (matriz [persona × rota × ação] da seção 7.3) e reporte célula divergente.
3. RLS ativa por transação e `SET LOCAL` sob PgBouncer? Prove com o teste de vazamento cruzado.
4. Payload: proprietário e prestador recebem dado fora do escopo, mesmo para descartar no cliente?
5. `pino` com redact: zero PAN, zero PII sensível em log.
6. Step-up e dupla aprovação presentes nas ações de 7.3 e 9.4? `maker_checker` existe como CHECK no banco?
7. Nenhuma ferramenta bloqueada de 9.12.4 existe no servidor MCP?

Não edite nada. FALHAS primeiro, com arquivo:linha e o teste que prova o problema.
```

```markdown
---
name: convention-checker
description: Use após qualquer lote de edição e antes de cada merge. Varredura mecânica das convenções duras do CLAUDE.md. Rápido e barato.
tools: Read, Grep, Glob, Bash
model: haiku
---
Varra o diff e reporte violações, com arquivo:linha:

1. Campo monetário tipado como `number` ou usando float.
2. Data de estadia como `Date`/timestamp em vez de data civil.
3. `SET app.` sem `LOCAL`.
4. Literal numérico de alíquota, retenção ou prazo de canal fora de tabela/seed/teste.
5. Server Action sem validação Zod ou sem checagem de ability.
6. `console.log` com objeto que possa conter PII; padrão de cartão em log.
7. Migration existente modificada.
8. Método/rota cujo nome sugira exclusão em packages/evidence.

Não edite. Saída: lista plana violação · arquivo:linha · regra do CLAUDE.md violada. Se nada, diga "limpo".
```

```markdown
---
name: a11y-reviewer
description: Use ao criar ou alterar componente, tela ou gráfico. WCAG 2.2 AA e as três rejeições de design da seção 5.9.3.
tools: Read, Grep, Glob, Bash
model: sonnet
---
1. Rode axe nas rotas afetadas.
2. Contraste de texto mínimo 4.5:1. REPROVE glow ou vidro atrás de número, tabela ou texto.
3. REPROVE status comunicado só por cor — exige texto.
4. REPROVE barra hachurada em série de valor real (hachura só em "previsto"/"anterior").
5. REPROVE mais de um gradiente saturado por conjunto de KPI cards.
6. Teclado, foco visível, e alvo de toque grande no app de campo e no portal do prestador (uso com luva).

Não edite. Saída: violação · impacto · correção proposta.
```

**Construtores — escrevem, cada um com diretório exclusivo (5.11.7)**

```markdown
---
name: domain-modeler
description: Use na Fase 0 e sempre que entidade, agregado ou máquina de estados mudar. Trabalha só em packages/domain, sem nenhum I/O.
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus
---
Modele o domínio em packages/domain. Zero I/O, zero import de banco, zero framework.

Entregue: entidades e agregados; invariantes como funções puras testáveis; máquinas de estado de reserva, pagamento, unidade, documento fiscal, OS e evidência; eventos de domínio; diagramas Mermaid em docs/domain.

Toda invariante de I1–I10 expressável como função pura ganha um teste que a viola e falha.
Não toque em packages/db, apps/** nem em nada com I/O. Se precisar, pare e reporte.
```

```markdown
---
name: migration-writer
description: Use SEMPRE que houver mudança de schema. É o ÚNICO autorizado a escrever em packages/db. NUNCA rode duas instâncias em paralelo — migration é fila de um.
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus
---
Migrations SQL versionadas para PostgreSQL 16.

Absolutas:
- Migration aplicada NUNCA é alterada. Nova migration corrige.
- Compatível com a versão anterior da aplicação (expand/contract). Nunca DROP COLUMN no mesmo deploy que remove o uso.
- Toda tabela nasce com tenant_id e política RLS.
- Constraint que expresse invariante vem com teste Testcontainers que a viola e falha.
- Índice justificado por EXPLAIN, não por intuição.
- Teste de isolamento sob PgBouncer em modo transação.

Se a mudança tocar o ledger ou evidência: PARE e confirme que é puramente aditiva antes de escrever.
Entregue SQL + RLS + teste + nota de rollback.
```

```markdown
---
name: adapter-builder
description: Use para construir ou alterar UM adapter de canal (Airbnb/Booking/VRBO/Expedia), de gateway (Asaas/Stripe/Pagar.me/AbacatePay) ou fiscal. Um por invocação — são paralelizáveis entre si.
tools: Read, Write, Edit, Grep, Glob, Bash, WebFetch
model: sonnet
---
Construa o adapter atrás da porta definida em 9.2, 9.3 ou 9.6.

1. Confirme a especificação real na documentação oficial. Se não puder confirmar, DECLARE a incerteza e liste o que falta verificar. NUNCA invente contrato de terceiro.
2. Implemente a porta completa, com `capabilities` declaradas explicitamente.
3. Contract test Pact + fixtures gravadas do sandbox.
4. Idempotência, verificação de assinatura de webhook, backoff com jitter, circuit breaker, DLQ.
5. docs/integrations/<adapter>.md: pré-requisitos, credenciais, sandbox, mapeamento de campos, runbook de falha.

Escreva SOMENTE em packages/{channels|payments|fiscal}/<seu-adapter>/** e no seu doc.
Precisa de mudança de schema ou de domínio? PARE e reporte ao orquestrador.
```

```markdown
---
name: frontend-builder
description: Use para construir ou alterar UI. Aplica os tokens da seção 5.9 e recusa as três coisas da 5.9.3.
tools: Read, Write, Edit, Grep, Glob, Bash
model: sonnet
---
Next.js App Router, React 19, Tailwind v4, shadcn/ui.

Aplique 5.9: cockpit escuro e denso (linha de 40px), storefront claro e orientado a foto, um só conjunto de tokens em @theme, mono com figuras tabulares em todo valor monetário, sidebar com rótulos + cmdk como acelerador.
Recuse e proponha alternativa: glow/vidro atrás de dado; hachura em valor real; múltiplos gradientes saturados em KPI cards.
Todo componente entrega estados de carregando/vazio/erro/parcial e story no Storybook.
Nenhum componente é "pronto" antes de passar por a11y-reviewer.
```

**Especialistas — densos, leitura por padrão**

```markdown
---
name: fiscal-specialist
description: Use em qualquer trabalho de NFS-e, ISS, retenções ou obrigações acessórias. Conhece as seções 9.6 e 9.10.3.
tools: Read, Grep, Glob, Bash, WebFetch
model: opus
---
Revise e especifique o módulo fiscal.

Regra que não se negocia: alíquota, código de serviço, regra de retenção e prazo de canal JAMAIS em código — tabela versionada por vigência, sempre.

Verifique: idempotência por fato gerador (nenhuma nota emitida duas vezes sob retry forçado); série e numeração de RPS com unicidade e recuperação de gaps; guarda de 5 anos em bucket WORM; separação de itens tributáveis e não tributáveis.

TERMINE SEMPRE com a lista explícita de pontos que exigem validação de contador ou do manual vigente antes de produção. Essa lista é o entregável mais importante do seu trabalho.
Não edite código sem autorização do orquestrador.
```

```markdown
---
name: evidence-specialist
description: Use em captura de foto, checklist, níveis de garantia A0–A3 ou dossiê de sinistro. Proprietário de packages/evidence.
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus
---
Implemente as seções 9.8 e 9.9.

Garanta: selo assinado no dispositivo no momento da captura; hash chain append-only; ancoragem RFC 3161; pHash em `bit(64)` comparado por `bit_count(a # b)`; `assurance_level` em toda evidência; e o GUARDA NO SERVIDOR que bloqueia consequência financeira abaixo do nível exigido pela tabela 9.9, com erro acionável dizendo o que falta.

Duas regras inegociáveis: nenhuma rota de exclusão (I10); nenhuma consequência financeira decorre de julgamento de modelo sem confirmação humana registrada.
```

```markdown
---
name: pricing-scientist
description: Use no motor de precificação: comp set, forecast de pickup, otimização, backtest, explicabilidade.
tools: Read, Write, Edit, Grep, Glob, Bash
model: opus
---
Implemente 9.7. Validação temporal, nunca aleatória, no forecast. O piso de preço vem do custo variável real de 9.11 — nunca de constante.

Toda decisão publicada grava snapshot com inputs, versão do modelo, sugerido, final e aprovador.

Reporte SEMPRE MAPE por horizonte de lead time e ΔRevPAR no backtest contra preço fixo. **Se o backtest não superar o baseline, diga isso** em vez de ajustar a métrica até parecer bom.
```

> **Quantidade:** nove subagentes é o catálogo, não a equipe de cada tarefa. Use **2 a 4 por fase**, escolhidos pela fase, mais os auditores no portão. Subagente tem contexto e custo próprios; abrir nove para trabalho pequeno é mais lento e mais caro que fazer direto.

### 5.11.4 Hooks — a peça que torna as invariantes mecânicas

Regra em prompt é pedido. **Hook é bloqueio.** É aqui que o Claude Code supera qualquer configuração declarativa: um hook `PreToolUse` que retorna código 2 **impede a ação e devolve o motivo ao agente**, que então corrige. Nenhum subagente, em nenhum modelo, contorna isso.

Implemente em `.claude/hooks/`, ligados em `settings.json`:

| Hook | Evento | O que bloqueia | Invariante |
|---|---|---|---|
`block-applied-migration.sh` | PreToolUse (Edit\|Write) | Edição de arquivo em `packages/db/migrations/` que já conste no registro de aplicadas | Convenção de migration |
`block-evidence-deletion.sh` | PreToolUse (Edit\|Write\|Bash) | Rota, método ou SQL que exclua evidência; `rm` em caminho de evidência | **I10** |
`block-ledger-mutation.sh` | PreToolUse (Edit\|Write) | `UPDATE`/`DELETE` em tabela de lançamento; remoção de `reversal_of_id` | **I3** |
`block-hardcoded-tax.sh` | PreToolUse (Edit\|Write) | Literal numérico de alíquota/retenção/prazo de canal em `packages/fiscal` ou `vendors`, fora de seed e teste | 9.6, 9.10.3 |
`block-money-float.sh` | PostToolUse (Edit\|Write) | Campo monetário tipado `number` ou aritmética float sobre valor | Convenção |
`block-set-without-local.sh` | PostToolUse (Edit\|Write) | `SET app.` sem `LOCAL` | **I-multi-tenancy** |
`block-secrets.sh` | PreToolUse (Write) | `.env` com valor, `.pfx`, `.p12`, chave privada, token | Segurança |
`run-package-tests.sh` | PostToolUse (Edit) | — roda `vitest` do pacote alterado e devolve a falha ao agente | Qualidade |
`log-subagent.sh` | SubagentStop | — anexa modelo usado, faixa, arquivos tocados e resultado em `docs/build-log.md` | **Rastreabilidade e custo** |
`phase-gate.sh` | Stop | Encerrar o turno com portão de fase pendente em `docs/fase-atual.md` | Processo |
`session-brief.sh` | SessionStart | — imprime fase atual, faixas abertas e portões pendentes | Contexto |

O `log-subagent.sh` merece destaque: ele constrói o **registro de quem fez o quê, com qual modelo**. Sem ele você não tem como auditar a política de 5.11.2 nem entender o custo do projeto.

### 5.11.5 Comandos de barra — `.claude/commands/`

`/fase <n>` inicia a fase em plan mode, lê o portão de saída da seção 13 e propõe as faixas · `/portao` roda `invariant-auditor` + `security-reviewer` + `convention-checker` em paralelo e consolida · `/adapter <canal|gateway>` abre worktree e delega ao `adapter-builder` · `/migration <descrição>` delega ao `migration-writer` com o checklist · `/fechar-fase` verifica o portão, atualiza ADRs e `docs/fase-atual.md` · `/custo` resume `docs/build-log.md` por modelo e faixa.

### 5.11.6 Skills — `.claude/skills/*/SKILL.md`

Procedimento com passos, sem necessidade de contexto isolado: `nova-conta-contabil` · `novo-checklist` · `gerar-xlsx` (repasse, apuração de ISS, fluxo de caixa, contagem de estoque) · `gerar-docx-pdf` (contrato de administração, contrato de locação por temporada, extrato do proprietário, laudo de dedetização).

**Critério de escolha, para não inflar o setup:** restrição que vale sempre → `CLAUDE.md`. Procedimento com passos → **skill**. Tarefa multi-etapa que precisa de contexto próprio → **subagente**. Bloqueio que não pode depender de boa vontade → **hook**.

### 5.11.7 Propriedade de arquivos e paralelismo

Conflito entre agentes se evita por **propriedade exclusiva de diretório**, não por boa vontade.

| Faixa | Proprietário | Diretórios exclusivos |
|---|---|---|
Domínio | `domain-modeler` | `packages/domain/**`, `docs/domain/**` |
Banco | `migration-writer` | `packages/db/**` |
Canais | `adapter-builder` (1 por canal) | `packages/channels/<canal>/**` |
Gateways | `adapter-builder` (1 por gateway) | `packages/payments/<gateway>/**` |
Fiscal | `fiscal-specialist` + orquestrador | `packages/fiscal/**` |
Evidência | `evidence-specialist` | `packages/evidence/**` |
Pricing | `pricing-scientist` | `packages/pricing/**` |
UI | `frontend-builder` | `packages/ui/**`, `apps/*/app/**` |
Infra e `.claude` | orquestrador (Opus) | `infra/**`, `.claude/**`, `CLAUDE.md` |

**Paralelo autorizado** (arquivos disjuntos): os 4 adapters de canal entre si · os 4 de gateway entre si · componentes de UI independentes · fixtures · e2e · docs de integração · backtest de pricing.

**Nunca em paralelo:**
- Duas instâncias de `migration-writer`. Fila de um, sempre.
- Qualquer coisa que altere o schema do **ledger** ou de **evidência** — núcleo de I2, I3 e I10.
- Duas frentes mexendo na matriz de autorização (7.3).
- `packages/domain` junto com quem o consome. Modele primeiro.
- Fases inteiras. O roadmap é sequencial por acoplamento; o paralelismo vive **dentro** da fase.

### 5.11.8 Protocolo de integração

1. `git worktree` por faixa autorizada. Branch `feat/f<n>-<faixa>`.
2. Faixa pronta = testes do pacote passando · story no Storybook se houver UI · docs atualizados.
3. **Portão antes de qualquer merge:** `/portao` sem FALHA. UI adiciona `a11y-reviewer`. Fiscal adiciona `fiscal-specialist` com a lista de pendências para o contador.
4. Merge na ordem da propriedade: domínio → banco → serviços → UI. Nunca o inverso.
5. `/fechar-fase` verifica o portão de saída da seção 13, atualiza ADRs e `docs/fase-atual.md`.
6. **Faixa que falha em auditoria volta para a faixa.** Corrigir na integração apaga o rastro de onde o problema nasceu.
7. **Os auditores também rodam em CI**, em modo headless (`claude -p`), em todo PR. Portão que depende de alguém lembrar de rodar não é portão.

---

# 6. BOUNDED CONTEXTS

```
identity/       autenticação, RBAC/ABAC, multi-tenancy
inventory/      propriedades, unidades, amenidades, mídia, regras da casa
availability/   calendário, restrições (min/max LOS, CTA/CTD), bloqueios
rates/          planos tarifários, temporadas, LOS pricing, taxas
booking/        cotação, reserva, alteração, cancelamento, políticas
distribution/   adapters de OTA, mapeamento, reconciliação
payments/       orquestração multi-gateway, tokens, split, disputas
ledger/         plano de contas, dupla entrada, conciliação, DRE
fiscal/         RPS/NFS-e SP, padrão nacional, retenções, obrigações
approvals/      fila central de aprovações e alçadas
housekeeping/   viradas, checklists, inspeção, máquina de estados da unidade
evidence/       captura, selo, hash chain, níveis de garantia
supply/         estoque, enxoval, patrimônio, reposição preditiva
vendors/        prestadores, OS, retenções, scorecard, portal
workforce/      equipe própria, escala, produtividade, custódia de acessos
crm/            hóspedes, mensageria omnichannel, reviews
pricing_intel/  comp set, forecast, otimização, explicabilidade
owner_portal/   extratos, repasses, desempenho por unidade
analytics/      KPIs, coortes, atribuição de canal
```

## 6.1 Modelagem anti-overbooking (implementar exatamente assim)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE reservations (
  id            uuid PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  unit_id       uuid NOT NULL,
  stay          daterange NOT NULL,          -- '[checkin, checkout)'
  status        text NOT NULL,               -- pending|confirmed|cancelled|no_show
  channel       text NOT NULL,               -- direct|airbnb|booking|vrbo|expedia
  external_ref  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_overlap EXCLUDE USING gist (unit_id WITH =, stay WITH &&)
    WHERE (status IN ('pending','confirmed')),
  CONSTRAINT stay_valid CHECK (lower(stay) < upper(stay))
);
```

Complemente com: fila **serializada por `unit_id`** para eventos de canal; `SELECT ... FOR UPDATE` na unidade entre cotação e confirmação; *hold* com TTL para checkout em andamento; reconciliação periódica canal↔calendário com alerta de divergência.

## 6.2 Máquina de estados da unidade (I9)

```
ready ──check-in──▶ occupied ──check-out──▶ dirty
                                              │
                              ┌───────────────┴──────────────┐
                              ▼                              ▼
                        cleaning ──▶ clean ──▶ inspected ──▶ ready
                              │        │            │
                              └────────┴────────────┴──▶ rework
qualquer estado ──▶ blocked (manutenção, dano, obra, uso do proprietário)
```

`clean` é o que a camareira declara; `inspected` é o que a Titan confirma. `ready` vem de `inspected`, ou de `clean` quando a unidade cair fora da amostra de inspeção (9.8.5). Nunca por atalho sem registro.

## 6.3 Multi-tenancy

`tenant_id` em toda tabela + **Row Level Security**. Contexto por transação: `SET LOCAL app.tenant_id`, `app.actor_id`, `app.owner_scope`. Nenhuma query de aplicação sem tenant no `WHERE` — garantido por RLS, não por disciplina. Testar com Testcontainers **sob PgBouncer**.

---

# 7. CINCO PORTAIS E AUTORIZAÇÃO

## 7.1 Papéis

**Cockpit Titan** (`console.DOMINIO`)

| Papel | Escopo |
|---|---|
`titan.owner` | Tudo, incluindo usuários, contratos e configuração fiscal |
`titan.revenue` | Tarifas, pricing, restrições, distribuição, promoções. Sem repasse/banco |
`titan.finance` | Ledger, AP/AR, conciliação, repasses, NFS-e, extratos. Não altera tarifas |
`titan.operations` | Limpeza, manutenção, estoque, prestadores, escala |
`titan.support` | Reservas, hóspedes, inbox, alterações e cancelamentos até limite |
`titan.field` | App de campo: só suas tarefas do dia, PII mínima |
`titan.auditor` | Leitura total, escrita zero |
`titan.agent.*` | **Service principals dos agentes**, escopo mínimo, nunca reutilizam credencial humana |

Impersonation com trilha e banner permanente. Aprovação por duas pessoas acima de limite.

**Portal do Proprietário** — vê apenas suas unidades, filtrado por `ownership_share`. Desempenho (ocupação, ADR, RevPAR, mix de canal, YoY, benchmark anonimizado da carteira); extrato de repasse com trilha da receita bruta ao líquido e PDF; NFS-e e relatório anual de rendimentos; calendário com privacidade reduzida do hóspede; solicitação de bloqueio para uso próprio com **receita renunciada exibida antes de confirmar**; documentos e laudos. **Sem acesso** a: pricing de outras unidades, dados de outros proprietários, ledger consolidado, margem da Titan com fornecedores.

**Área do Hóspede** — **acesso sem senha por padrão**: magic link / OTP, ou **código da reserva + sobrenome**. Motivo: hóspede de OTA chega com e-mail mascarado (`@guest.airbnb.com`) e não cria conta. Conta opcional com passkey como gancho de retenção. Reservas, pagamentos com recibos e NFS-e, pagar saldo, alterar datas com recálculo e preview, cancelar com **preview de reembolso calculado no servidor**, upsells, check-in digital, código de acesso na janela válida, manual da casa, mensagens, avaliação, e **vistoria de chegada compartilhada** (9.8.1).

> **Restrição obrigatória:** reserva originada em Airbnb/Booking/VRBO/Expedia **não pode** ser cancelada nem alterada por fora do canal — política e reembolso pertencem à OTA. Detecte a origem, explique, ofereça *deep link* e abra chamado interno. Cancelamento silencioso de reserva de OTA gera divergência financeira e penalidade de canal.

**Portal do Prestador** — seção 9.10.5.

## 7.2 Rotas

```
apps/web
  /                                   busca e destinos (ISR)
  /imovel/[slug]                      página da unidade (ISR, revalidate por evento)
  /reservar/[quoteId]                 checkout (dinâmico, sem cache)
  /minha-reserva                      OTP / magic link
  /minha-reserva/[code]               detalhe
     /pagamentos /alterar /cancelar /check-in /acesso /mensagens /vistoria /avaliar
  /prestador                          OTP
  /prestador/onboarding               autosserviço (9.10.5)
  /prestador/os  /os/[id]  /os/[id]/executar  /os/[id]/concluir
  /prestador/financeiro /documentos /desempenho

apps/console
  (staff)/                            dia: chegadas, saídas, pendências, alertas
  (staff)/calendario                  TAPE CHART multi-unidade
  (staff)/reservas /[id]              timeline: eventos, pagamentos, notas, mensagens, agentes
  (staff)/tarifas                     planos, temporadas, restrições, edição em massa
  (staff)/pricing                     sugestões, explicabilidade, backtest, autonomia
  (staff)/distribuicao                saúde dos canais, mapeamentos, divergências, DLQ
  (staff)/financeiro                  ledger, AP/AR, conciliação, settlements, DRE, projeção
  (staff)/fiscal                      fila de emissão, rejeições, cofre, apuração
  (staff)/repasses                    fechamento por proprietário, PIX em lote, extratos
  (staff)/aprovacoes /[id]            FILA CENTRAL DE APROVAÇÕES (9.4.2)
  (staff)/limpeza                     quadro do dia
  (staff)/limpeza/revisao/[taskId]    painel de revisão fotográfica
  (staff)/limpeza/checklists          editor de templates versionados
  (staff)/limpeza/servicos            OS técnicas e laudos
  (staff)/estoque                     saldos, movimentos, contagens, reposição
  (staff)/prestadores /[id]           cadastro, certidões, scorecard, OS
  (staff)/equipe                      escala, produtividade, acessos
  (staff)/inbox                       omnichannel (site, WhatsApp, e-mail, OTAs)
  (staff)/automacao                   console de agentes (9.12.6)
  (staff)/config                      usuários, papéis, políticas, tributos, integrações, auditoria
  (owner)/  /unidades/[id]  /extratos  /fiscal  /bloqueios  /documentos
```

## 7.3 Matriz de permissões — gerar teste automatizado a partir dela

| Ação | titan.owner | titan.finance | titan.revenue | titan.operations | titan.support | titan.field | vendor | owner | guest | agent (máx.) |
|---|---|---|---|---|---|---|---|---|---|---|
Ver reserva | ✓ | ✓ | ✓ | ✓ | ✓ | parcial | ✗ | anonimizada | própria | ✓ |
Criar/alterar reserva | ✓ | — | ✓ | — | ✓ até limite | — | ✗ | — | própria se `direct` | propor |
Cancelar reserva | ✓ | — | — | — | ✓ até limite | — | ✗ | — | própria se `direct` | propor |
Alterar tarifa/restrição | ✓ | — | ✓ | — | — | — | ✗ | — | — | dentro da banda |
Ligar pricing automático | ✓ | — | ✓ | — | — | — | ✗ | — | — | ✗ |
Emitir NFS-e | ✓ | ✓ | — | — | — | — | ✗ | — | — | ✗ (só enfileirar) |
Cancelar NFS-e | ✓ +step-up | ✓ +step-up | — | — | — | — | ✗ | — | — | ✗ |
Reembolsar | ✓ +step-up | ✓ +step-up | — | — | ✓ até limite | — | ✗ | — | solicitar | propor |
Executar repasse/PIX | ✓ +step-up +2ª aprov. | ✓ +step-up +2ª aprov. | — | — | — | — | ✗ | — | — | ✗ |
Ver ledger consolidado | ✓ | ✓ | — | — | — | — | ✗ | ✗ | ✗ | leitura escopada |
Ver dado de outro proprietário | ✓ | ✓ | agregado | agregado | — | — | ✗ | ✗ | ✗ | ✗ |
Ver PII de hóspede | ✓ | mínima | ✗ | mínima | ✓ | **mínima (horário + código)** | **✗** | ✗ | própria | mínima + redação |
Gerenciar usuários/papéis | ✓ +step-up | — | — | — | — | — | ✗ | ✗ | ✗ | ✗ |
Ver saldo de estoque | ✓ | ✓ | — | ✓ | — | sua unidade/dia | ✗ | ✗ | ✗ | leitura |
Registrar consumo | ✓ | — | — | ✓ | — | ✓ (sua tarefa) | ✓ (sua OS) | ✗ | ✗ | ✗ |
Ajuste de inventário | ✓ +step-up | ✓ | — | ✓ c/ aprovação | — | ✗ | ✗ | ✗ | ✗ | ✗ |
Criar PO / comprar | ✓ | ✓ | — | ✓ até alçada | — | ✗ | ✗ | ✗ | ✗ | propor |
Cadastrar prestador | ✓ | ✓ | — | ✓ | — | ✗ | ✗ | ✗ | ✗ | ✗ |
**Alterar conta bancária** (proprietário ou prestador) | ✓ +step-up +2ª aprov. | ✓ +step-up +2ª aprov. | ✗ | ✗ | ✗ | ✗ | solicitar | solicitar | ✗ | ✗ |
Aprovar OS / medição | ✓ | ✓ | — | ✓ até alçada | — | ✗ | ✗ | ✗ | ✗ | propor |
Pagar prestador | ✓ +step-up | ✓ +step-up | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
Editar template de checklist | ✓ | — | — | ✓ | — | ✗ | ✗ | ✗ | ✗ | ✗ |
Executar checklist | ✓ | — | — | ✓ | — | ✓ | ✓ (sua OS) | ✗ | ✗ | ✗ |
Aprovar/reprovar limpeza | ✓ | — | — | ✓ | — | ✗ | ✗ | ✗ | ✗ | ✗ |
`override` de I9 | ✓ +motivo | — | — | ✓ +motivo | — | ✗ | ✗ | ✗ | ✗ | ✗ |
Ver fotos da unidade | ✓ | ✓ | — | ✓ | ✓ | as suas | as da sua OS | **✓ (sua unidade)** | vistoria da estadia | ✓ |
Retirar caução | ✓ +step-up +dossiê | ✗ | — | solicitar | solicitar | ✗ | ✗ | ✗ | ✗ | ✗ |
Revogar acesso/chave | ✓ | ✗ | — | ✓ | — | ✗ | ✗ | ✗ | ✗ | propor |
**Excluir evidência** | **ninguém** | — | — | — | — | — | — | — | — | — |
**Alterar evidência ou score registrado** | **ninguém** | — | — | — | — | — | — | — | — | — |

**Step-up auth obrigatório:** reembolso, cancelamento fiscal, execução de repasse, alteração de papel, troca de conta bancária, retirada de caução, desligamento de guardrail de agente, exportação em massa de PII, ajuste de inventário acima do limite.

## 7.4 Padrão de segurança dos portais

1. **Toda** rota de servidor e Server Action começa por `const ability = await getAbility()` e uma checagem explícita. Ausência de botão na UI não é autorização.
2. RLS ativa por transação (ver armadilha em 4.2).
3. PII de hóspede (documento, foto, contato) cifrada em coluna, com log de acesso: registra quem viu o quê.
4. Proprietário e prestador **nunca** recebem payload com dados fora do escopo, nem para descartar no cliente. Filtro no banco, não no React. Provado por teste de payload.
5. Retenção: PII de hóspede com expurgo programado; documento fiscal preservado 5 anos (exceção legal ao direito de eliminação — documentar no DPIA).

---

# 8. ESTRATÉGIA MOBILE — três níveis de capacidade

| Nível | Superfície | Capacidade | Para quem |
|---|---|---|---|
**T1** | PWA no navegador, sem instalar | Câmera na página via `getUserMedia` (**sem galeria**), overlay de referência, validação de qualidade no cliente, chave WebCrypto não-extraível, fila IndexedDB, upload retomável, geolocalização | Prestador eventual, primeira OS |
**T2** | PWA instalado | T1 + push, `navigator.storage.persist()`, *background sync* no Android | Prestador recorrente, hóspede, proprietário |
**T3** | App nativo (Expo) | T2 + chave com respaldo de hardware, upload em background garantido, offline durável, leitura nativa de código de barras | Equipe própria de campo e empresas parceiras de alto volume |

Decisões por persona: **hóspede** = PWA + WhatsApp (ninguém instala app para 3 noites; fricção de app store mata conversão); **proprietário** = PWA (uso mensal); **staff cockpit** = web desktop, responsivo para triagem; **equipe de campo** = nativo (câmera, código de barras, offline em prédio sem sinal); **prestador** = PWA, com convite para instalar após N serviços.

**Limitações a especificar em ADR-0013** — o agente errará por otimismo se não estiverem escritas:
- **Background Sync não existe no iOS Safari.** Upload progride só em primeiro plano. Consequência de produto: a tela de conclusão pede para manter o app aberto e a fila retoma na reabertura.
- **Despejo de armazenamento no iOS** para sites pouco usados. Mitigação: `navigator.storage.persist()`, fila pequena, upload agressivo, aviso de pendência antiga.
- **Push no iOS** só com PWA instalado. Notificação principal por WhatsApp/SMS.
- **Sem chave em hardware no navegador** → nível de garantia A1, nunca A3 (seção 9.9).
- **Relógio do dispositivo é manipulável** → servidor compara e sinaliza desvio.

Revisitar app nativo de hóspede só se a taxa de recorrência na reserva direta passar de ~25%.

---

# 9. MÓDULOS FUNCIONAIS

## 9.1 Storefront de locação

- Busca por destino/datas/hóspedes com autocomplete geográfico; filtros (preço, quartos, amenidades, pet, acessibilidade); lista + mapa sincronizados com *cluster*.
- Página da unidade: galeria otimizada (AVIF/WebP, LQIP), calendário com preço por noite, mínimo de noites, **cálculo transparente do total** (diárias + limpeza + serviço + tributos), política de cancelamento, avaliações, mapa aproximado (endereço exato só após confirmação), **selo "limpo e inspecionado em [data]"**.
- **Cotação server-side.** Nunca confie em preço vindo do cliente: `POST /quotes` devolve `quote_id` assinado com TTL; o checkout consome o `quote_id`.
- Checkout: identificação por OTP/social, hóspede principal e acompanhantes, PIX/cartão/boleto/link, **pré-autorização de caução**, upsells (early check-in, berço, enxoval extra, transfer).
- Pós-reserva: e-mail/WhatsApp transacional, **check-in digital** (documento com OCR, *liveness* opcional, assinatura eletrônica do contrato de locação por temporada), manual da casa, **código de fechadura com janela temporal**, canal de mensagens.
- SEO/performance: SSR + `schema.org/VacationRental` e `LodgingBusiness`, sitemap dinâmico, hreflang, LCP < 2.0s em 4G, CLS < 0.05. Cloudflare cacheando o público.
- Acessibilidade WCAG 2.2 AA.

## 9.2 Channel Manager

**Realidade de acesso — documente em ADR-0004 e planeje o roadmap em torno disso:**

| Canal | Caminho | Pré-requisito real |
|---|---|---|
**Airbnb** | Sem API pública aberta. (1) **iCal** — disponibilidade unidirecional, latência de minutos a horas, sem tarifas nem reservas estruturadas; (2) **Partner/Software Partner API** — completa | Aprovação no programa, volume mínimo, certificação. Meses |
**Booking.com** | **Connectivity APIs** (Content, Availability & Rates, Reservations, Promotions) | Cadastro como Connectivity Partner + certificação por área funcional |
**Expedia Group** | **Expedia Partner Solutions / Partner Central** | Contrato + certificação |
**VRBO** | Expedia Group; trilha de *vacation rentals* | Idem, com requisitos próprios de conteúdo |

**Decisão obrigatória:** anti-corruption layer com a porta abaixo e **duas implementações desde o MVP** — `IcalChannelAdapter` (funciona hoje, sem certificação) e `AggregatorChannelAdapter` para um channel manager intermediário (Hostaway, Guesty, Beds24, Rentals United, NextPax, Lodgify ou similar), que entrega os quatro canais sob um contrato só enquanto as certificações diretas correm em paralelo. Adapters diretos são implementações plugáveis da mesma porta.

```ts
interface ChannelAdapter {
  readonly channel: ChannelId;
  readonly capabilities: {
    pushRates: boolean; pushRestrictions: boolean;
    pullReservations: boolean; pushContent: boolean;
    instantBooking: boolean; messaging: boolean;
  };
  syncContent(listing: ListingSnapshot): Promise<MappingResult>;
  pushAvailability(unitId: string, calendar: CalendarDelta[]): Promise<AckResult>;
  pushRates(unitId: string, rates: RateDelta[]): Promise<AckResult>;
  pullReservations(since: Date, cursor?: string): Promise<Page<ExternalReservation>>;
  handleWebhook(raw: RawWebhook): Promise<DomainEvent[]>;
  reconcile(unitId: string, range: DateRange): Promise<Divergence[]>;
}
```

Transversais: mapeamento unidade↔listing auditável com detecção de *drift*; **fila por unidade com coalescing** de deltas; backoff exponencial com jitter, *circuit breaker* por canal, DLQ com reprocesso pelo cockpit; **reconciliação diária** de disponibilidade e tarifas com correção assistida; paridade tarifária configurável por canal com trilha do motivo do desvio; diferencial pró-reserva direta quando o contrato permitir; reserva externa gera reserva de domínio completa, com pagamento marcado como *collected by channel* e provisão da comissão no ledger; painel "Saúde da Distribuição" (lag por canal, taxa de erro, divergências, reservas não mapeadas). Bloqueio por I9 propaga aos canais.

## 9.3 Pagamentos — orquestração multi-gateway

Provedores: **Asaas**, **Stripe**, **Pagar.me**, **AbacatePay**.

- **Roteamento declarativo por regra:** método (PIX/cartão/boleto), moeda, país do emissor, valor, custo efetivo (MDR + taxa fixa + antecipação), taxa de aprovação histórica, necessidade de split, health check. Fallback em cascata com retry controlado.
- Capacidades a validar na documentação vigente: **Asaas** (PIX, boleto, cartão, recorrência, split, webhooks — forte para BRL e repasse a terceiros) · **Stripe** (cartão internacional, 3DS/SCA, multimoeda, Radar, Connect — essencial para hóspede estrangeiro) · **Pagar.me** (cartão, PIX, boleto, split de recebíveis, antecipação, tokenização) · **AbacatePay** (PIX com fricção mínima e custo baixo — ótimo para reserva direta e upsell).
- **Máquina de estados:** `created → authorized → captured → settled → refunded/partially_refunded → disputed → charged_back`, por tentativa e por intenção.
- **Caução:** pré-autorização com captura tardia onde houver suporte, ou PIX com devolução programada. Conta de passivo no ledger; retirada exige dossiê (9.8.7) e nível de garantia A2 (9.9).
- **Idempotência ponta a ponta:** `Idempotency-Key` por intenção, dedupe de webhook por `event_id`, assinatura verificada, replay seguro.
- **PCI-DSS:** apenas hosted fields/tokenização. Nenhum PAN em log, banco, cache ou trace. **Teste que falha o build se padrão de cartão aparecer em log.**
- **Antifraude:** score do gateway + regras próprias (velocidade de reservas, mismatch país/IP/documento, primeira reserva de alto valor, cancelamento imediato, risco de festa). Fila de revisão manual.
- **Reembolso/cancelamento:** cálculo automático pela política, com desdobramento de comissão de canal, taxa de gateway não reembolsável e efeito fiscal (cancelamento/substituição).
- **Conciliação de repasses:** ingestão do relatório de *settlement* de cada gateway e casamento linha a linha com transações e taxas. Divergência abre exceção no cockpit.

## 9.4 Movimentação de valores e aprovações

### 9.4.1 Sete camadas de controle

**Camada 0 — a decisão que vale mais que todas as outras juntas.**
> **A plataforma nunca inicia saque do gateway para conta bancária.**

Configure cada gateway para **liquidação automática em uma única conta bancária pré-cadastrada da Titan** e **desabilite transferência/saque via API**. Onde houver suporte, use chave restrita sem escopo de payout. Consequência: com comprometimento **total** da aplicação — código, banco, servidor, credenciais — o atacante não desvia o saldo do gateway. Custo: zero, é configuração. O repasse ao proprietário sai da conta bancária da Titan, por PIX, sob as camadas 2–5.

**Camada 1 — lado do gateway (checklist operacional, não código):** chaves separadas por ambiente; chaves restritas por função; allowlist de IP amarrada aos IPs de saída da VPS; **MFA com passkey** em todo painel de gateway; separação entre quem acessa o painel e quem detém a chave de produção; segredo de webhook rotacionado; conta bancária de destino travada, alterável só no painel com MFA, nunca por API.

**Camada 2 — dupla custódia (maker–checker).** Quem cria o lote não aprova. Enforce no banco:
```sql
ALTER TABLE payout_batches ADD CONSTRAINT maker_checker
  CHECK (approved_by IS NULL OR approved_by <> created_by);
```
Acima de um segundo limite, **duas aprovações distintas**, ambas com step-up.

**Camada 3 — step-up que assina *o quê*, não só prova *quem*.** Erro comum: pedir TOTP e liberar a sessão por 15 minutos — o atacante com sessão viva usa a janela. O desafio é **vinculado ao hash do payload**:
```
challenge = HMAC(server_key, sha256(canonical_json(batch)) || nonce || exp)
```
O aprovador confirma *este lote, com estes beneficiários, neste total*, e o token serve uma vez só. A tela mostra exatamente o que entra no hash: total, nº de beneficiários, cinco maiores valores, e **destaque em qualquer conta bancária alterada nos últimos 30 dias**. Passkey (WebAuthn) preferível a TOTP.

**Camada 4 — limites, velocidade e carência.** Teto por transação, agregado diário e por beneficiário. **Carência de 24–72h para conta bancária nova ou alterada** antes do primeiro pagamento — bloqueia a fraude mais comum do setor, o "e-mail do proprietário pedindo para trocar a conta". Notificação para o contato **antigo** e o novo. Alerta de anomalia de valor, horário ou volume.

**Camada 5 — titularidade do beneficiário.** Antes do primeiro repasse, valide que o titular da chave PIX é o mesmo CPF/CNPJ do proprietário (ou prestador) contratado. **Divergência = bloqueio, não aviso.**

**Camada 6 — detecção.** Trilha imutável de solicitação, aprovação, rejeição e execução. Alerta em canal que **o aprovador não controla**. **Conciliação diária obrigatória:** débitos efetivos × aprovações registradas; débito sem aprovação é incidente P0. Reembolso é saída de dinheiro: mesmos controles, limiares menores, valor sempre do motor de política.

**Camada 7 — recuperação.** `/docs/runbook-pagamentos.md`: contatos de emergência de gateways e banco, revogação de chave, congelamento de repasses (kill switch de pagamentos), passo a passo de contestação. **Testado, não só escrito.**

### 9.4.2 Fila central de aprovações — `(staff)/aprovacoes`

```ts
type ApprovalRequest = {
  id: string;
  type: 'payout_batch' | 'refund' | 'purchase_order' | 'work_order_budget'
      | 'bank_account_change'        // ← risco máximo
      | 'price_out_of_band' | 'fiscal_cancellation' | 'inventory_adjustment'
      | 'security_deposit_charge' | 'role_change' | 'pii_bulk_export'
      | 'agent_action';
  requestedBy: Actor;                 // humano OU agent:principal
  rationale: string;                  // obrigatório
  impact: { amountCents?: bigint; affectedEntities: string[]; diff?: Json };
  risk: 'low' | 'medium' | 'high';
  requiredApprovals: 1 | 2;
  stepUpRequired: boolean;
  slaAt: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'executed' | 'failed';
};
```

Regras: **nada de aprovação por chat** — botão de Telegram não é controle interno; rejeição exige comentário; append-only (mudança de ideia gera nova solicitação); SLA com escalonamento para o papel acima; execução idempotente pela `idempotency_key` da solicitação; `titan.auditor` lê tudo e aprova nada; ação de agente aprovada volta para a timeline da entidade com rótulo do ator (`agent:financeiro v1.2 → aprovado por Fulano`). Badge de contagem no shell do cockpit.

## 9.5 Ledger financeiro — entradas e saídas em dupla entrada

**Não construa um fluxo de caixa simplista.**

- **Plano de contas** configurável, com contas nativas: receita de hospedagem, taxa de limpeza, taxa de serviço, comissão de canal (despesa), taxa de gateway (despesa), ISS a recolher, repasse a proprietário (passivo), caução (passivo), chargeback, estoque de suprimentos, estoque de enxoval, despesa de suprimentos, despesa de lavanderia, serviços de terceiros, retenções a recolher, imobilizado, depreciação acumulada, ajustes.
- Todo evento gera lançamento: reserva confirmada → receita a apropriar; check-out → apropriação; captura → caixa; settlement → banco; repasse → baixa de passivo; consumo de estoque → despesa no centro de custo da unidade.
- **Competência e caixa simultâneos.** Reserva de dezembro paga em outubro tem de aparecer certa nos dois relatórios. Receita reconhecida **pro rata die** por noite ocupada.
- **AP/AR:** fornecedores (lavanderia, camareira, manutenção, condomínio, IPTU, energia, internet), recorrências, comprovantes anexos, aprovação em duas etapas acima do limite.
- **Conciliação:** OFX/CNAB, Open Finance quando disponível, webhooks PIX, e conciliação transação↔settlement por gateway (cada um tem relatório distinto — modele `settlement_batch` e case linha a linha, sinalizando taxas e retenções).
- **Centro de custo por unidade e por proprietário**, com rateio configurável de despesas comuns.
- **Repasse ao proprietário:** extrato mensal com receita bruta, comissões, despesas rateadas com comprovante, tributos retidos, líquido; PIX em lote sob 9.4; PDF; histórico no portal.
- **Relatórios:** DRE gerencial por unidade e carteira, fluxo de caixa projetado com reservas futuras e sazonalidade, aging, margem por canal, CAC por canal, RevPAR/ADR/ocupação, GOP por unidade.

## 9.6 Fiscal — NFS-e São Paulo

**Enquadramento configurável e versionado, nunca em código.** Modele as duas hipóteses e valide com a assessoria tributária:

1. **Locação por temporada pura** (Lei 8.245/91, arts. 48–50, até 90 dias): locação de bem imóvel, historicamente **fora do campo do ISS** (não consta da lista da LC 116/2003).
2. **Hospedagem** (item 9.01 da LC 116/2003 — "hospedagem em hotéis, apart-service, flat e congêneres"): com serviços agregados (limpeza periódica, enxoval, recepção, gestão profissional recorrente), tende a ser serviço → **ISS → NFS-e obrigatória.** É o cenário típico de operação profissional de *short-stay*.

Configure **por unidade e por tipo de item cobrado**: enquadramento, código de serviço municipal, alíquota, base de cálculo com deduções admitidas, retenções — tudo com **vigência** (`valid_from`/`valid_to`), porque a **Reforma Tributária (EC 132/2023 + LC 214/2025)** altera esse terreno: 2026 é ano de transição de **CBS e IBS**, com regime específico para operações com bens imóveis e regras próprias para locação de curta duração e hotelaria, incluindo redutores. **Crie `tax_rules` versionadas por data, com testes por cenário e relatório de simulação. Sinalize explicitamente quais percentuais precisam de confirmação na legislação vigente.**

**Integração com a Prefeitura de SP:**
- Pré-requisitos: **CCM** ativo, certificado **ICP-Brasil A1** (PKCS#12) ou A3, habilitação no sistema municipal.
- **Trilha 1 — WebService municipal (Nota Fiscal Paulistana):** SOAP em `nfe.prefeitura.sp.gov.br/ws/lotenfe.asmx` (homologação em `nfeh.…`), operações do tipo `EnvioRPS`, `EnvioLoteRPS`, `TesteEnvioLoteRPS`, `ConsultaLote`, `ConsultaNFe`, `CancelamentoNFe`. Envelope XML assinado (XMLDSig) **e assinatura própria de cada RPS** sobre a concatenação de campos definida no manual. Controle de **série e numeração sequencial de RPS** com unicidade e recuperação de *gaps*. Roda no container `worker`.
- **Trilha 2 — Padrão Nacional:** **DPS** contra o Ambiente de Dados Nacional, retorno com chave de acesso e DANFSe. **Verifique o estágio atual da adesão de São Paulo ao padrão nacional** antes de escolher a trilha primária.
- **Trilha 3 — Provedor intermediário** (Nuvem Fiscal, PlugNotas, Focus NFe, eNotas, NFE.io): reduz drasticamente o risco de layout e manutenção. **Comece por aqui no MVP**, com a mesma interface, e mantenha a integração direta como redução de custo em escala.

```ts
interface FiscalGateway {
  issue(input: ServiceInvoiceInput): Promise<IssuedInvoice>;   // idempotente por fato gerador
  cancel(invoiceId: string, reason: CancelReason): Promise<CancelResult>;
  substitute(invoiceId: string, input: ServiceInvoiceInput): Promise<IssuedInvoice>;
  query(ref: InvoiceRef): Promise<InvoiceStatus>;
  fetchPdf(invoiceId: string): Promise<Buffer>;
  fetchXml(invoiceId: string): Promise<string>;
}
```

Adicionais: emissão **automática e assíncrona** disparada por evento configurável (check-out, captura, virada de mês em estadia longa), com fila resiliente, retry com backoff e fila de exceções; **idempotência forte** — chave natural persistida antes da chamada, jamais duas notas para o mesmo fato gerador mesmo sob retry; separação de itens tributáveis e não tributáveis (caução, reembolso, taxas de terceiros); cofre com **guarda de 5 anos** de XML e PDF em bucket WORM; conciliação nota↔reserva↔lançamento; retenção de ISS quando o tomador é responsável; envio da nota ao hóspede e disponibilização na área dele; **multi-município no modelo de dados** desde o início (`municipality_code` + gateway por município). Obrigações acessórias no roadmap: apuração mensal de ISS, **DIMOB** quando houver intermediação/administração, livro-caixa, arquivos para o contador, e relatório de apoio ao **carnê-leão** do proprietário PF.

## 9.7 Precificação dinâmica

**Guardrails de conformidade — leia antes de projetar.** *Scraping* de Airbnb/Booking viola os termos de uso, e é risco jurídico e de bloqueio. Fontes legítimas:

1. **Dados licenciados:** AirDNA, Key Data, Lighthouse, Transparent; ou motores com API (PriceLabs, Beyond, Wheelhouse). Modele como `MarketDataProvider` plugável.
2. **Sinais próprios — os mais valiosos e sem risco:** curva de pickup histórica, conversão busca→reserva, visualizações por listing, elasticidade observada, rejeição de cotação, lead time.
3. **Sinais públicos:** feriados e eventos (Anhembi, Expo Center Norte, São Paulo Expo, shows, congressos), voos, clima, calendário escolar, tarifa hoteleira via APIs de parceiros com contrato.
4. Se alguma coleta web for contratualmente autorizada: `robots.txt`, rate limit conservador, zero PII, proveniência e base legal por fonte. **Peça confirmação explícita antes de implementar qualquer coletor.**

**Pipeline:**

```
[1] Comp Set    similaridade geo (PostGIS KNN, raio adaptativo por densidade)
                + atributos (capacidade, quartos, tipo, amenidades premium, nota)
                em espaço vetorial normalizado → 8–30 comparáveis com score de confiança
[2] Base Price  regressão hedônica (log-preço ~ atributos + efeitos fixos de micro-região)
                → âncora "justa"; fallback: mediana ponderada do comp set
[3] Forecast    LightGBM/CatBoost sobre features de pickup (reservas acumuladas por
                lead time), sazonalidade (Fourier), DOW, eventos, ocupação do comp set,
                preço relativo → probabilidade de venda por faixa → curva de demanda
[4] Otimização  maximizar receita esperada sob restrições: PISO = custo variável real
                (9.11) + margem mínima; teto (paridade/percepção); min/max LOS;
                noites órfãs → desconto; last-minute decay; early-bird; escada de LOS;
                política RevPAR vs. ocupação-alvo definida pelo gestor
[5] Exploração  bandit contextual (Thompson sampling) com orçamento limitado por
                unidade/mês, para aprender elasticidade sem destruir receita
[6] Publicação  deltas por canal com paridade, arredondamento psicológico e
                SNAPSHOT DA DECISÃO (inputs, versão do modelo, sugerido, final, aprovador)
```

Produto: **modo sugestão vs. automático** por unidade, com limite de variação diária (ex.: ±15%) e aprovação obrigatória fora da faixa (via 9.4.2); **explicabilidade obrigatória** — para qualquer noite, mostrar contribuição de cada fator, comparáveis usados, ocupação do comp set, evento detectado; **simulador e backtest** com receita contrafactual vs. realizada; alertas (unidade subprecificada com 100% de ocupação a 60 dias; pickup zero a 14 dias; queda abrupta do comp set; evento novo); **regras manuais sempre vencem** e são versionadas. Métricas: ΔRevPAR vs. baseline, ΔADR, ocupação, RevPAR por unidade disponível, MAPE do forecast por horizonte.

## 9.8 Limpeza, serviços e evidência fotográfica

### 9.8.1 Superfícies

**Cockpit — `(staff)/limpeza`, quadro do dia:** colunas por estado (`dirty` · `cleaning` · `clean` · `inspected` · `ready` · `rework` · `blocked`); card com unidade, hora do check-out, **contagem regressiva até o próximo check-in**, responsável, tempo decorrido vs. padrão, fotos capturadas/exigidas, alertas; **semáforo de risco** vermelho quando o tempo restante < tempo-padrão + deslocamento; filtros por zona/responsável/prestador; ação em massa (reatribuir, reprogramar, escalar).

**Painel de revisão fotográfica — `(staff)/limpeza/revisao/[taskId]`:** galeria por ambiente na ordem do checklist; **comparação lado a lado com a foto de referência**; comparação com o check-in anterior para detectar dano surgido na estadia; flags automáticos visíveis (duplicata, fora de horário, fora do geofence, qualidade insuficiente, item ausente); **nível de garantia de cada evidência** (9.9); ações: aprovar · aprovar com observação · **reprovar com motivo → `rework` sem novo pagamento** · abrir OS · abrir sinistro · marcar enxoval para descarte ou cobrança da lavanderia.

**App de campo e portal do prestador — captura guiada:**
```
Abrir tarefa
  → checklist por ambiente, na ORDEM FÍSICA do trajeto pela casa
  → para cada item de foto obrigatória:
       câmera abre COM A FOTO DE REFERÊNCIA COMO OVERLAY FANTASMA
       captura só pela câmera; galeria bloqueada
       validação IMEDIATA no dispositivo (nitidez, exposição, enquadramento)
         → reprovada? pede de novo na hora, não depois
       metadados SELADOS no momento da captura (9.8.2)
  → registro de consumo por escaneamento (9.11)
  → problema? foto + descrição → OS aberta na hora
  → objeto esquecido? achados e perdidos com foto e vínculo à reserva
  → concluir → declaração assinada → fila de sincronização (offline-first)
```
Detalhes que decidem se funciona: offline-first real (subsolo, wifi de hóspede desligado) com **carimbo de tempo da captura, não do upload**; upload retomável por partes que sobrevive a fechar o app e trocar de rede; alvos grandes para uso com uma mão e luva, ditado por voz; compressão no cliente, original em wifi.

**Área do hóspede — a jogada que reduz disputa de caução:**
1. **Selo de confiança** ("limpo e inspecionado em [data/hora]") com seleção curada de fotos.
2. **Vistoria de chegada compartilhada:** o hóspede recebe as fotos do estado na entrada e tem **24h para apontar dano pré-existente** pelo app, com foto própria. Quando você precisar retirar caução, existe registro de que ele teve chance de contestar e não contestou. Desarma a maioria das disputas antes de existirem, e é justo com quem chegou e encontrou algo quebrado.

### 9.8.2 Contexto `evidence/` — como a foto se torna prova

O problema real: foto de ontem reaproveitada, foto de outra unidade, foto tirada da porta sem ter feito o serviço — e, do outro lado, hóspede alegando manipulação. Resolve-se com **procedência**, não com confiança.

**Selo no dispositivo, no instante da captura:**
```ts
const original    = await camera.capture();
const contentHash = sha256(original);
const envelope = {
  contentHash,
  capturedAt: deviceClock.nowISO(),   // hora da CAPTURA
  deviceId, appVersion,               // chave emitida no enrollment
  taskId, checklistItemId, unitId, room,
  geo: { lat, lng, accuracy } | null,
  referenceShotId,
};
const signature = hmac(deviceKey, canonicalJson(envelope));
// envelope + signature + bytes seguem juntos na fila offline
```

**No servidor:** verifica assinatura e recalcula `sha256` (divergência = rejeição); compara relógio do dispositivo com o do servidor (desvio = **flag**, não bloqueio); grava em `evidence_log` **append-only encadeado** (`entry_hash = sha256(prev_hash || contentHash || envelope)`); **ancoragem diária** da raiz com carimbo de tempo **RFC 3161** de uma TSA, arquivado — é o padrão reconhecido para "este arquivo existia nesta data e não mudou" (não use "blockchain": é desnecessário e mais difícil de defender); armazena original e derivadas, com EXIF em coluna separada e não como fonte de verdade.

**Detecção de reuso — determinística, não por IA:** **pHash/dHash** indexado, comparado contra as N últimas fotos da mesma unidade, as do mesmo colaborador em 30 dias e o corpus geral; **galeria bloqueada** por padrão (se liberada em exceção, marcada com origem diferente e sem valor de prova plena); **geofence** contra as coordenadas do imóvel — com ressalva honesta de que GPS indoor erra, tratado como sinal de baixa confiança e nunca bloqueio, geolocalizando **a tarefa, não a pessoa**, sem rastreamento fora do horário; **cadência temporal** (25 fotos em 40 segundos não é uma limpeza); ordem do checklist como sinal fraco. Nenhum sinal isolado pune ninguém: eles **priorizam a revisão humana**, que é o único ato que reprova serviço ou retém valor.

**Retenção, custo e LGPD.** Volume real: 40 unidades × ~1,5 viradas/semana × ~25 fotos ≈ **78 mil fotos/ano**; a 500 unidades, ≈ **1 milhão/ano**.

| Camada | Política | A 500 unidades |
|---|---|---|
Derivada comprimida (~400 KB) | Retenção pelo prazo legal/contratual | ≈ 390 GB/ano |
Original (~3 MB) | **Apenas 30 dias**, salvo sinistro/disputa aberta → preservado até resolução + prescrição | ≈ 2,9 TB/ano se guardasse tudo — é exatamente por isso que a regra dos 30 dias existe |

Ciclo de vida no bucket (quente → frio → arquivo), compressão no cliente, projeção de custo no dashboard. **LGPD: proibido fotografar pessoas** — instrução no app e desfoque automático de face como rede de segurança; objeto pessoal só em achados e perdidos com acesso restrito e expurgo; foto de ambiente pode revelar dado sensível (medicamento, documento) → retenção curta para vistoria de entrada e treinamento da equipe; tudo no DPIA.

### 9.8.3 Foto de referência — o padrão-ouro por unidade

Conjunto que **define o padrão de entrega**: como a cama fica montada, como a toalha é dobrada, onde os amenities ficam, o enquadramento de cada ambiente. Resolve quatro problemas: enquadramento comparável (sem isso a detecção de dano não funciona); treinamento visual de gente nova; critério objetivo de reprovação ("está diferente da referência neste ponto" é discutível de forma produtiva, "não gostei" não é); e insumo para atualizar o anúncio nas OTAs. Versionado — reforma ou mudança de padrão gera nova versão com vigência.

### 9.8.4 Motor de checklist

```ts
type ChecklistTemplate = {
  id: string; version: number;
  serviceType: 'limpeza_saida' | 'limpeza_intermediaria' | 'limpeza_profunda'
             | 'dedetizacao' | 'ar_condicionado' | 'piscina' | 'estofado'
             | 'jardinagem' | 'manutencao_corretiva' | 'vistoria';
  appliesTo: { unitTypeId?: string; unitId?: string };
  validFrom: Date; validTo?: Date;
  sections: Section[];              // ordenadas pelo TRAJETO FÍSICO
  passingScore: number;
  locales: ['pt-BR', 'es', 'en'];
};

type ChecklistItem = {
  id: string; label: string; help?: string;
  helpImage?: string;               // instrução VISUAL, não só texto
  weight: number;                   // peso no score
  blocking: boolean;                // impede concluir
  type: 'photo'                     // { minShots, referenceShotId, framing }
      | 'confirm' | 'numeric'       // pH, cloro, medidor { unit, min, max }
      | 'select' | 'text'
      | 'scan'                      // item de estoque
      | 'timer'                     // TEMPO DE CONTATO
      | 'signature';
  conditional?: { ifItem: string; equals: unknown };
  onFail?: 'open_work_order' | 'flag_damage' | 'require_photo_and_note';
  expectedSeconds?: number;         // base do tempo-padrão da tarefa
};
```

O que faz diferença: **ordenação pelo trajeto físico** (quem limpa anda em sequência; fora de ordem gera foto tirada em lote no fim); **item `timer` de tempo de contato** — desinfetante só desinfeta se permanecer molhado pelo tempo do fabricante, e o item cronometra e não libera antes; **instrução visual** com foto do certo, porque equipe e prestadores têm escolaridade e idioma variados; **ramificação condicional** ("encontrou dano?" → sim → foto + descrição → abre OS e marca candidato a sinistro), sem a qual o achado morre na cabeça da camareira; **itens bloqueantes seletivos** (bloquear tudo ensina a burlar); **snapshot imutável do template na execução** — auditoria seis meses depois precisa saber qual checklist estava em vigor; **score ponderado** alimentando scorecard e a correlação com a nota de limpeza do hóspede.

**Por tipo de serviço, com laudo de saída:**

| Serviço | Itens característicos | Saída |
|---|---|---|
Limpeza de saída | Foto por ambiente vs. referência, enxoval, amenities, lixo, timer de contato, achados e perdidos, consumo escaneado | Score + evidências + baixa de estoque |
**Dedetização** | Produto, **nº de registro sanitário**, dosagem, praga-alvo, técnico responsável, áreas, prazo de carência | **Certificado de execução** — condomínio e hóspede pedem |
Ar-condicionado | Filtro antes/depois, bandeja, dreno, pressão, temperatura de insuflamento | Laudo + próxima preventiva |
Piscina | `numeric` de pH e cloro com faixa, produtos, foto da água | Série histórica |
Estofado / colchão | Antes/depois, produto, tempo de secagem | **Bloqueio da unidade até fim da secagem (I9)** |
Manutenção corretiva | Diagnóstico, peça, antes/depois, garantia | Vínculo ao ativo no patrimônio |
Vistoria | Conjunto completo, comparação com a anterior | Dossiê (9.8.7) |

Todo laudo: PDF vinculado à unidade e ao ativo, visível para Titan e proprietário, com evidências e trilha de hashes.

### 9.8.5 Inspeção por amostragem baseada em risco

Inspecionar 100% não escala; aleatório é ineficiente. **Obrigatória** quando: colaborador em período probatório · reclamação de limpeza nas últimas N estadias · hóspede VIP, estadia longa ou de alto valor · virada com tempo abaixo do padrão · qualquer flag de evidência · primeira estadia após manutenção ou reforma · unidade nova na carteira. Fora disso, amostragem aleatória com taxa que **cai conforme o histórico de qualidade sobe** e volta a subir na primeira reprovação.

### 9.8.6 Verificação assistida por visão — fronteira explícita

**O modelo tria; o humano decide.**

| Tarefa | Confiabilidade | Uso permitido |
|---|---|---|
Qualidade técnica da foto (foco, luz, enquadramento vs. referência) | Alta | Bloquear a captura na hora e pedir de novo. Automático |
Reuso/duplicata | Alta — e é pHash determinístico | Flag automático |
Presença/ausência de item (toalha, amenities, lixeira, cama montada) | Boa | Flag para revisão. Nunca reprova sozinho |
Leitura de medidor por OCR | Boa | Preenche com confirmação |
Diferença check-in × check-out no mesmo enquadramento | Média | Candidatos a dano → **revisão humana obrigatória** |
"Está limpo?" fino; "essa mancha é nova?"; dano subtil | Baixa | Apenas sugestão. **Nunca** base para retenção de caução, reprovação de serviço ou desconto |

**Regra dura:** nenhuma consequência financeira para hóspede, colaborador ou prestador decorre de julgamento de modelo sem confirmação humana registrada. O parecer entra no dossiê identificado como tal, nunca como laudo.

### 9.8.7 Dossiê de sinistro e os prazos que derrubam

Montado automaticamente: fotos de referência; fotos do check-in da estadia com o registro de que o hóspede teve janela para contestar e não contestou; fotos do check-out no mesmo enquadramento; laudo do inspetor; orçamento de reparo; itens de enxoval afetados; cadeia de custódia de acesso (quem entrou, quando); trilha de hashes com carimbo de tempo; **nível de garantia de cada peça**. Exportável em PDF.

**Cada canal tem prazo próprio para abrir sinistro, e vários exigem que ocorra antes do próximo check-in.** Portanto: a vistoria de saída é **obrigatória antes de liberar a unidade**; **motor de prazos configurável por canal** em tabela versionada (nunca em código — mudam sem aviso) com contagem regressiva e escalonamento agressivo. Sinistro fora do prazo é perda certa. **Meta do módulo: zero sinistro perdido por prazo.**

### 9.8.8 Programação de viradas

Virada no mesmo dia é a restrição mais dura: check-out às 11h, check-in às 15h, N unidades, M pessoas, deslocamento entre endereços. É um **problema de roteamento com janelas de tempo (VRPTW)**, não uma lista.

Considere: janela real de cada unidade (check-out efetivo → próximo check-in), tempo-padrão por unidade e serviço **aprendido do histórico**, tempo de deslocamento real, skills, zona, jornada e intervalo, custo/hora, e prioridade por hora de chegada do hóspede. Saída: escala sequenciada por pessoa, com **alerta antecipado de virada em risco** e mitigação sugerida (reatribuir, acionar plantão, ou avisar o hóspede e oferecer late check-in com cortesia **antes** de ele chegar). Heurística gulosa + busca local (OR-Tools resolve bem), reexecutada a cada evento de check-out, não em batch noturno.

## 9.9 Níveis de garantia da evidência (`assurance_level`)

Não finja que foto capturada no navegador tem a mesma procedência que foto de app nativo com chave em hardware. **Classifique, registre e limite o uso.**

| Nível | Origem | Sinais |
|---|---|---|
**A0** | Upload de arquivo / galeria / e-mail | Nenhuma procedência. Só ilustra |
**A1** | Câmera na página (T1), chave WebCrypto não-extraível | Hash do conteúdo, hora de captura assinada, sem galeria, geo opcional |
**A2** | PWA instalado (T2), armazenamento persistente, dispositivo com histórico | A1 + continuidade de dispositivo, push confirmado, menor risco de despejo |
**A3** | App nativo (T3), chave com respaldo de hardware | A2 + assinatura em enclave, upload em background garantido |

**Enforce no servidor, não na UI:**

| Consequência | Nível mínimo | Adicional |
|---|---|---|
Comprovar execução e liberar pagamento de OS | **A1** | Conjunto completo + aceite humano |
Reprovar serviço e registrar retrabalho | **A1** | Itens específicos apontados |
Cobrar peça de enxoval da lavanderia | **A1** | Foto de referência + foto do dano |
Liberar unidade como `ready` (I9) | **A1** | — |
**Retenção de caução do hóspede** | **A2** | + vistoria de chegada não contestada + confirmação humana + dossiê 9.8.7 |
**Sinistro contra canal (OTA)** | **A2** | + dentro do prazo do canal |
Cobrança contra prestador / desconto | **A2** | + dupla revisão humana |

Se a evidência estiver abaixo do exigido, o sistema **não bloqueia o trabalho** — bloqueia *aquela consequência financeira* e diz o que falta ("esta retenção exige vistoria capturada em app instalado; solicite reinspeção do supervisor"). Honesto com o prestador, defensável para o hóspede, sem paralisar a operação. Mostre o nível no painel de revisão e inclua-o no dossiê: um dossiê que declara o nível de cada peça é muito mais forte do que um que finge que todas são iguais.

## 9.10 Prestadores de serviço

### 9.10.1 Cadastro e compliance

Camareira PJ, lavanderia, elétrica, hidráulica, ar-condicionado, chaveiro, dedetização, jardinagem, piscina, marido de aluguel, internet, condomínio.

Cadastro: razão social/nome, CNPJ/CPF com **validação de situação cadastral**, CNAE compatível, endereço, contatos, dados bancários/PIX **com verificação de titularidade** (9.4.1 camada 5), contrato, escopo, SLA, tabela de preços, área de atendimento, disponibilidade, seguro, e **certidões com vencimento monitorado** (CND federal, FGTS, CNDT, municipal). Certidão vencida → **bloqueio automático de novas OS**, com alerta 30 dias antes. Quem entra sozinho no imóvel: termo de confidencialidade, verificação de antecedentes conforme política, registro de custódia de chave, treinamento registrado.

### 9.10.2 Ciclo de OS

```
abertura (humana, agente, ou preventiva por ativo)
 → triagem e prioridade (hóspede in-house = P0)
 → orçamento (3 cotações acima do limite; alçada)
 → despacho (scorecard + disponibilidade + zona)
 → aceite do prestador (SLA de resposta)
 → execução: checklist guiado + evidência + material usado
 → aceite da Titan (ou reprovação → rework SEM novo pagamento)
 → medição e faturamento
 → pagamento com retenções (9.10.3)
 → avaliação → scorecard
```

### 9.10.3 Retenções — a parte que ninguém modela e depois dói

Modele como **tabela de regras versionada por vigência** (`withholding_rules`), como as regras tributárias de 9.6 — **nunca em código** — e **valide cada linha com a assessoria contábil antes de ligar**:

| Situação | Retenções candidatas a configurar |
|---|---|
Prestador **PJ**, limpeza/conservação/manutenção/vigilância ou cessão de mão de obra | **INSS 11%** sobre a base (cessão de mão de obra, Lei 8.212/91 art. 31) · **IRRF 1%** · **CSRF 4,65%** (CSLL 1% + PIS 0,65% + COFINS 3%) · **ISS** conforme o município |
Prestador PJ optante do **Simples Nacional** | Regime **diferente** — várias das acima não se aplicam. Exige declaração do prestador |
Prestador **PF autônomo** | **INSS 11%** descontado (respeitado o teto) · **INSS patronal 20%** (custo da Titan, não retenção) · **IRRF** progressivo · **ISS** conforme município · geração de **RPA** |
Obrigações acessórias | **EFD-Reinf** (retenções previdenciárias) e **eSocial** (prestador PF) |

Sistema: cálculo automático por prestador e tipo de serviço, líquido a pagar, RPA para PF, guias, comprovante de retenção ao prestador, e alimentação/exportação de EFD-Reinf e eSocial. Retenção errada é passivo trabalhista e fiscal, não detalhe de conveniência.

### 9.10.4 Scorecard e roteamento

Pontualidade (aceite e chegada no SLA), qualidade (score de checklist + nota do hóspede na estadia seguinte), **taxa de retrabalho**, aderência a orçamento, tempo de resolução, reclamações. O agente de Operações usa no despacho; ranking visível no cockpit; abaixo do piso → plano de melhoria → bloqueio.

### 9.10.5 Portal do Prestador

**Onboarding self-service (5–8 min, no celular):**
```
convite (SMS/WhatsApp) → OTP
 → CNPJ/CPF → validação de situação cadastral e CNAE
 → captura por FOTO dos documentos (contrato social, certidões, seguro, CNH)
   → OCR extrai validade
 → dados bancários / PIX → VERIFICAÇÃO DE TITULARIDADE (divergência = bloqueio)
 → aceite de contrato, escopo, tabela de preços, confidencialidade (assinatura eletrônica)
 → treinamento curto com quiz (padrão Titan, químicos, conduta em imóvel de hóspede,
   LGPD: proibido fotografar pessoas)
 → enrollment do dispositivo (gera a chave de assinatura de evidência)
 → apto a receber OS
```
Certidão vencendo: aviso em 30 dias e bloqueio no vencimento; o próprio prestador atualiza por foto.

**Rotina:** minhas OS (hoje / próximas / aguardando aceite / em análise / pagas) · **aceitar ou recusar** com SLA · detalhe com escopo, valor, endereço, **acesso liberado só na janela do serviço**, fotos do problema, contato do supervisor — **sem nome, telefone ou qualquer dado do hóspede** · execução com checklist guiado e captura · conclusão com **declaração assinada** · **financeiro** com valor bruto, retenções discriminadas, líquido, previsão de pagamento e comprovantes · **scorecard próprio** com nota, retrabalho e ranking anonimizado (transparência melhora qualidade mais que multa).

**Ciclo de retrabalho:**
```
reprovado com motivo e ITENS ESPECÍFICOS apontados
 → notificação ao prestador com exatamente o que corrigir
 → nova execução vinculada como `rework_of`
 → NOVA captura obrigatória (a antiga permanece; nada é apagado — I10)
 → sem pagamento adicional → impacto no scorecard
 → reincidência → plano de melhoria → bloqueio
```
**Requisito de justiça:** reprovação sem apontar item específico e sem evidência **não é permitida pelo sistema**. Motivo livre não basta; o inspetor marca quais itens falharam. Protege o prestador de arbítrio e você de disputa.

### 9.10.6 Sem criar vínculo empregatício

Checklist detalhado é **especificação de escopo contratual** — legítimo em contrato de prestação. O que gera prova de vínculo é subordinação, jornada imposta, exclusividade, controle de horário como empregado.

Para `contractor`: **aceita ou recusa** cada OS, não recebe escala imposta; **sem registro de ponto** (existe hora de início e fim *do serviço*, que é medição contratual); sem exigência de exclusividade no fluxo; sem uniforme imposto pelo software (identificação para acesso ao condomínio é outra coisa). **A UI sinaliza quando uma configuração aumentar o risco.** Para `employee`, os controles de escala e ponto ficam ativos, com ponto vindo do sistema certificado integrado (9.12 → 9.11.7). Decisão final é do jurídico; o software não deve criar o problema por descuido de design.

## 9.11 Estoque, suprimentos e patrimônio

### 9.11.1 Quatro classes, tratamentos distintos

| Classe | Exemplos | Contabilização | Controle |
|---|---|---|---|
**Consumível** (`amenity`) | Sabonete, shampoo, papel, café, água, kit dental | Ativo → despesa **no consumo** | BOM da tarefa; nível-par por unidade |
**Material de limpeza** (`chemical`) | Desinfetante, multiuso, cloro, álcool, saco de lixo, pano | Ativo → despesa no consumo | **Rendimento e diluição** (1:100), lote, validade, FISPQ |
**Enxoval** (`linen`) | Lençol, fronha, toalha, cobertor, protetor | Ativo circulante **em rotação** | Par 3×, ciclos de lavagem, taxa de descarte |
**Patrimônio** (`asset`) | TV, ar-condicionado, colchão, geladeira, fechadura | **Imobilizado com depreciação** | Nº de série, garantia, vida útil, preventiva, titularidade |

Mais: **chaves e credenciais** (`access_item`) — não é estoque, é **cadeia de custódia** (9.11.7).

### 9.11.2 Modelo

```
item_master        SKU, classe, marca, categoria, classificação ABC, NCM, foto
uom + conversion   unidade de compra ≠ de consumo (CAIXA de 12 × 500ml → ml).
                   Conversão versionada — fonte nº 1 de erro
item_variant       tamanho/cor (crítico em enxoval: solteiro/casal/queen)
warehouse          central, regionais, e ESTOQUE DA UNIDADE (cada imóvel é almoxarifado)
stock_lot          lote, validade, custo de entrada, fornecedor, NF
stock_balance      saldo por (warehouse, item, lot) — materializado, reconstruível
stock_movement     APPEND-ONLY: entrada_nf | transferencia | consumo_tarefa |
                   consumo_venda | perda | quebra | devolucao | ajuste_inventario |
                   envio_lavanderia | retorno_lavanderia | descarte
                   → sempre com actor, motivo, referência e lançamento contábil
par_level          por (unit, item): mínimo, ideal, máximo, lead time, segurança,
                   ponto de ressuprimento
bom                "receita" por tipo de tarefa → baixa automática e custo teórico
asset_register     patrimônio: unidade, proprietário, aquisição, valor, vida útil,
                   depreciação, garantia, nº série, laudo, foto, status
linen_kit          kit por unidade/tipo de cama, ciclos acumulados, previsão de descarte
inventory_count    contagem cíclica: escopo, contador, divergência, aprovação
```

**Custeio: custo médio ponderado móvel (CMPM)** como padrão — é o que a apuração fiscal brasileira comporta e o que o contador pede. FIFO só com razão registrada em ADR. Custo de consumo **nunca** recalculado retroativamente; ajuste por movimento novo (I3).

### 9.11.3 O ciclo completo

```
1. COMPRA        requisição → cotação (3 orçamentos acima do limite) → PO →
                 aprovação por alçada (9.4.2) → recebimento
2. ENTRADA       XML da NF-e do fornecedor ingerido (manifestação do destinatário via
                 distribuição DFe) → conferido contra a PO → movimento + lote + custo →
                 contas a pagar  →  D Estoque / C Fornecedores
3. DISTRIBUIÇÃO  transferência central → unidade, com romaneio e confirmação por
                 escaneamento no app de campo
4. CONSUMO       camareira conclui a tarefa → BOM gera baixa TEÓRICA → ela ajusta o real
                 → movimento  →  D Despesa de suprimentos (centro de custo = UNIDADE)
                                / C Estoque
5. RATEIO        despesa no centro de custo → extrato de repasse conforme o CONTRATO
6. VARIÂNCIA     teórico (BOM) × real (ajustado) × financeiro (compras) → relatório por
                 unidade, colaborador e período → alerta de desperdício, desvio ou BOM
                 mal calibrada
7. REPOSIÇÃO     nível-par + previsão de ocupação → sugestão de compra (9.11.6)
```

**Venda ao hóspede** (`consumo_venda`): minibar, mercadinho, kit extra → receita + baixa + item na conta da reserva + tratamento fiscal próprio (mercadoria ≠ serviço; validar). Margem fácil que, se não nascer no modelo, nunca entra.

### 9.11.4 Enxoval — o caso que quebra sistemas genéricos

Não é consumível nem imobilizado. É **ativo circulante em rotação**.

- **Par 3×:** por cama, três jogos — na cama, na lavanderia, na prateleira. Sub-dimensionar atrasa virada; super-dimensionar imobiliza capital. Calcule o par recomendado a partir de ocupação, ciclo da lavanderia e taxa de descarte.
- **Ciclo:** `envio_lavanderia` → `retorno_lavanderia` com contagem, divergência (peça perdida pela lavanderia = cobrança do fornecedor) e incremento do contador de ciclos.
- **Vida útil em ciclos, não em meses.** Ao atingir o limite, fila de descarte com inspeção. KPIs: custo de enxoval por estadia, perda por 100 estadias.
- **Conciliação com a lavanderia:** nota por peça/kg × movimentos. Divergência sistemática é dinheiro escapando de forma invisível.
- Peça manchada na vistoria alimenta retenção de caução (9.8.7) ou cobrança da lavanderia, com evidência A1.

### 9.11.5 Patrimônio e vistoria

Registro por unidade com o proprietário como titular quando o bem é dele: aquisição, valor, vida útil, depreciação, garantia, NF, nº de série, fotos datadas — visível no portal dele. **Vistoria de entrada e saída** com checklist por ambiente e fotos obrigatórias, comparadas com a anterior: é a prova que sustenta retenção de caução. **Preventiva por ativo** (limpeza de ar-condicionado a cada N meses, revisão de colchão, troca de filtro) gerando OS antes de virar reclamação. **Depreciação** mensal lançada no ledger, separada por titularidade (bem da Titan vs. do proprietário), com vida útil configurável e versionada.

### 9.11.6 Reposição preditiva

```
previsão de ocupação (9.7, forecast de pickup)
 → previsão de check-outs e hóspedes-noite por unidade
 → × BOM por tipo de tarefa e por hóspede
 → demanda projetada de consumíveis, químicos e ciclos de enxoval
 → confronto com saldo + estoque de segurança + lead time do fornecedor
 → sugestão de compra consolidada por fornecedor (com quebra por unidade)
 → aprovação por alçada (9.4.2) → PO
```
Mais: classificação **ABC** definindo rigor de contagem (A semanal, C trimestral); **contagem cíclica** em vez de inventário geral paralisante; alerta de ruptura antes do check-out crítico; item de giro zero (capital parado); validade próxima em químicos.

### 9.11.7 Equipe própria (`workforce`)

**Não construa folha de pagamento nem ponto eletrônico oficial.** Ponto próprio se enquadra como **REP-P** na Portaria MTP 671/2021, com exigências específicas (impossibilidade de alteração de marcação, geração de AFD e AEJ, comprovante ao trabalhador). É produto inteiro, com risco trabalhista se sair errado. **Integre** com sistema certificado de ponto e com folha (Ahgora, Pontomais, Tangerino, Senior, ou escritório contábil). Registre em ADR-0011.

**Construa:** cadastro operacional (cargo, função, zonas, skills, certificações com validade, EPI com ficha assinada, treinamentos, admissão/desligamento); **escala e capacidade** (turnos, disponibilidade, rodízio, cobertura de feriado, custo/hora, necessidade de mão de obra derivada da previsão de check-outs — mesma curva da reposição); **produtividade** (tempo médio por tipo de tarefa por colaborador, unidades por turno, retrabalho, score de checklist, nota do hóspede na estadia seguinte); **remuneração variável com cuidado** — gatilho composto (score ≥ X **e** zero reclamação **e** zero retrabalho), com teto e transparência, porque métrica de velocidade pura gera limpeza rápida e ruim; **segurança do trabalho** (EPI por tarefa, FISPQ acessível no app, registro de incidente, alerta para tarefa de risco como limpeza de janela); **custo de pessoal por unidade** no centro de custo, fechando com o ledger e o extrato.

**Chaves, códigos e cadeia de custódia** — um dos maiores riscos reais: funcionário ou prestador desligado com código de porta ativo. Registro de cada chave física e credencial digital, a quem está atribuída, desde quando, com log de transferência; **revogação automática no desligamento** (evento dispara revogação de todos os códigos e bloqueio de portal, com checklist de confirmação humana); auditoria cruzando log da fechadura × tarefa agendada — acesso sem tarefa correspondente gera alerta.

**App de campo** (`apps/field`, T3): tarefas do dia com rota otimizada, checklist com foto obrigatória por ambiente, **escaneamento de item para consumo**, solicitação de reposição, abertura de OS com foto, achados e perdidos, e **PII mínima** — a camareira precisa do horário e do código da porta, não do telefone do hóspede.

## 9.12 Agentes de IA — dois planos

### 9.12.1 Princípio não negociável

> **O agente nunca é a fonte de verdade nem executa cálculo com consequência financeira ou fiscal.** Preço, reembolso, tributo, rateio, retenção e saldo são calculados por **código determinístico e testado**. O agente decide *o quê* e *quando*, chamando ferramentas tipadas; o domínio decide *quanto*.

Isso preserva I1–I10: um LLM não viola constraint de banco nem burla autorização se só fala com o sistema por ferramentas permissionadas.

### 9.12.2 Realidade de Hermes e OpenClaw

**OpenClaw** (Steinberger + comunidade; ex-Clawdbot, renomeado em jan/2026) e **Hermes Agent** (Nous Research, fev/2026) são frameworks **local-first, messaging-first, de assistente pessoal**: daemon na sua máquina, qualquer provedor de LLM, WhatsApp/Telegram/Slack/Discord, heartbeat, agendamento em linguagem natural, memória em arquivos, skills, MCP-native.

São excelentes — e **errados para o plano que toca hóspede e dinheiro**. Não por qualidade, por modelo de tenancy e segurança:

| Achado | Consequência |
|---|---|
Ambos são **single-tenant por desenho**. A issue #34352 do repositório do Hermes descreve: um agente = um tenant, memória global, sessões sem escopo — rodar o mesmo agente num DM e num grupo faz informação sensível do DM aparecer na sessão do grupo | Um Concierge servindo 300 hóspedes na mesma instância é vazamento de PII esperando acontecer |
OpenClaw: desenho single-user, sem isolamento de permissão, sessão local em texto claro; "uma VM por usuário" quebra por volta de 30–50 usuários | Não escala para hóspede nem proprietário |
A documentação do OpenClaw **declara uso multi-tenant adversarial fora de escopo**, e trata identificador de sessão como roteamento, não fronteira de segurança | Não transfira ao framework responsabilidade que ele não assume |
**CVE-2026-25253** (CVSS 8.8, injeção de comando), corrigida a partir da 1.2.3 | Exige SLA de patch |
Pesquisa de segurança (PASB) achou vulnerabilidades em três estágios: prompt do usuário, uso de ferramenta e **recuperação de memória** | Memória envenenada é o vetor mais perigoso num sistema que emite nota e faz PIX |
Hermes **gera suas próprias skills** a partir de padrões repetidos | Ótimo para produtividade pessoal; inaceitável para o ledger |
Injeção de prompt não está resolvida por ninguém | Mensagem de hóspede é entrada hostil |

**Entre os dois, prefira Hermes:** trata segurança como restrição de partida (identidade pela plataforma de mensageria em vez de senha compartilhada de gateway, allowlists, códigos de pareamento com expiração curta e rate limit, separação admin/regular, documentação de segurança com camadas explícitas incluindo o aviso honesto de que o backend local não isola host). O OpenClaw tem ecossistema maior, mas seu `SECURITY.md` acumulou escopo declarado como "apenas hardening" após as divulgações. Nous Research captou em jul/2026 com valuation reportado de US$ 1,5 bi, o que reduz risco de continuidade.

**Comece só com Hermes.** Dois frameworks é o dobro de superfície de ataque e patch pelo mesmo ganho. Traga o OpenClaw depois, restrito a monitoramento somente-leitura.

### 9.12.3 Os dois planos

```
┌──────────────────────── PLANO OPERADOR ────────────────────────┐
│  Hermes Agent (cockpit do operador)   [OpenClaw: vigilância]    │
│  Usuários: SOMENTE staff Titan, por Telegram/Slack/WhatsApp     │
│  Entrada: comandos de humanos autenticados e allowlistados      │
│  Poder: leitura ampla + escrita estreita e limitada             │
│  NUNCA ingere: mensagem de hóspede, conteúdo de OTA, review,PDF │
└───────────────────────────┬────────────────────────────────────┘
                            │  ÚNICO caminho: MCP (apps/mcp)
                            │  tokens escopados · teto de valor
                            │  allowlist de ferramentas · auditoria
┌───────────────────────────┴────────────────────────────────────┐
│                      PLATAFORMA TITAN                          │
│  domínio determinístico · ledger · fiscal · autorização · RLS   │
├────────────────────────────────────────────────────────────────┤
│              PLANO PLATAFORMA (runtime próprio)                │
│  Concierge · Vendas · Risco · tudo voltado ao hóspede           │
│  multi-tenant real · ABAC por ator · prompts versionados        │
│  evals no CI · auditoria · isolamento por reserva               │
└────────────────────────────────────────────────────────────────┘
```

| # | Agente | Plano | Runtime | Autonomia inicial |
|---|---|---|---|---|
1 | **Concierge** — 24/7 pt/en/es, RAG sobre manual da casa e políticas, chegada, acesso, dúvidas, detecção de urgência | Plataforma | Próprio | N1 |
2 | **Vendas/Pré-reserva** — disponibilidade, cotação por ferramenta, upsell, recuperação de checkout, desconto só dentro do teto | Plataforma | Próprio | N1 |
3 | **Revenue** — interpreta o motor de pricing, redige justificativa, ajusta dentro da banda, noites órfãs, review semanal | Operador | Hermes | N2 na banda |
4 | **Operações** — escala a partir de check-outs, reatribuição, triagem de foto de manutenção, OS, reposição, validação de checklist | Operador | Hermes | N2 |
5 | **Financeiro** — casa settlement × transação × lançamento, anomalias, rascunho de extrato, cobrança de saldo | Operador | Hermes | N2 sugerir; **N0 para mover dinheiro** |
6 | **Fiscal** — vigia fila, traduz rejeição, propõe correção, checklist de fechamento | Operador | Hermes | N1 sempre |
7 | **Distribuição** — saúde de canal, drift de conteúdo, copy por canal, ranking, erro de mapeamento | Operador | OpenClaw (leitura) | N1 |
8 | **Risco** — fraude e risco de festa, revisão de documento, dossiê de chargeback | Plataforma | Próprio | N1 |
9 | **Reputação** — resposta a review, causa-raiz, recuperação preventiva | Híbrido | Hermes redige → aprovação | N1 |
10 | **Supervisor/QA** — amostra saídas, rubrica, evals, detecta regressão | Operador | Hermes | interno |

**Escala de autonomia** (por agente × unidade × tipo de ação): `N0` sugere internamente · `N1` redige e aguarda aprovação · `N2` executa e notifica com janela de veto · `N3` autônomo com amostragem de auditoria. **Promoção só por evidência** — acurácia medida ≥ meta em ≥ N casos, revisada pelo Supervisor. **Comece tudo em N1 por 30–60 dias.**

### 9.12.4 Fronteira MCP — `apps/mcp`

Os dois frameworks são MCP-native; este é o encaixe limpo. **Nenhum agente externo toca banco, arquivo ou API interna. Só MCP.** O host do agente não conhece a connection string.

```ts
// LEITURA (ampla, com redação de PII na fronteira)
occupancy_report({ from, to, unitIds? })
pickup_curve({ unitId, targetDate })
pricing_suggestions({ unitId, horizon })      // saída do motor determinístico
channel_health({ channel? })  ·  divergences_open({ channel?, unitId? })
fiscal_queue({ status })      ·  settlement_unmatched({ gateway, period })
ledger_query({ account, period, costCenter? })   // agregados, não PII
reservation_summary({ code })                     // nome mascarado, sem contato
housekeeping_board({ date })  ·  turnover_at_risk({ date })
stock_balance({ unitId?, itemId? })  ·  stock_variance({ period })
vendor_scorecard({ vendorId? })  ·  vendor_certifications_expiring({ days })
agent_quality_sample({ agent, n })

// ESCRITA (estreita, reversível, com teto NO SERVIDOR)
propose_rate_change({ unitId, dates, delta })   // fora da banda → vira proposta
set_restriction({ unitId, dates, minLos })
assign_housekeeping({ taskId, staffId })  ·  open_work_order({ unitId, priority, desc })
suggest_reconciliation({ settlementLineId, ledgerEntryId, confidence })
propose_purchase_order({ items, vendorId, rationale })
draft_message({ threadId, body })         // rascunho, nunca envio
draft_review_reply({ reviewId, body })
enqueue_fiscal_retry({ invoiceRef })      // enfileira, não emite
create_approval_request({ type, payload, rationale })

// BLOQUEADAS — NÃO EXISTEM como ferramenta para ninguém externo
// issue_nfse · cancel_nfse · execute_payout · process_refund
// charge_security_deposit · change_user_role · export_pii_bulk
// cancel_reservation · delete_evidence · raw_sql
```

Requisitos: **um service principal por instância** (`titan.agent.ops.hermes`, `titan.agent.watch.openclaw`), cada um com papel ABAC e allowlist, passando pela **mesma** camada de autorização que um humano; **tetos no servidor, não no prompt** (delta de tarifa, valor de OS, operações/hora) — violação retorna erro estruturado, e o modelo não negocia com constraint; **redação de PII na fronteira** (`reservation_summary` devolve `"Maria S."` e `guest_id`, nunca telefone, e-mail, documento ou dado de pagamento — porque a memória desses frameworks é arquivo em disco no host do agente); **toda chamada na trilha de auditoria** com `actor_type='agent'`, visível no Console de Automação; **kill switch = revogar o token MCP** do seu lado; **aprovações voltam para `(staff)/aprovacoes`**, não para o chat.

### 9.12.5 Guardrails — como código, não como instrução de prompt

1. **A instância que ingere conteúdo não confiável nunca tem ferramenta de escrita.** É a única defesa estrutural contra injeção de prompt que não depende de o modelo se comportar. Se o agente de Reputação lê review, ele só redige rascunho.
2. **Uma instância por papel**, em contêiner separado, credencial própria. Não existe "o agente da Titan" que faz tudo.
3. **Sem tool de shell/exec** em nenhuma instância com credencial Titan. Se precisar execução, backend sandboxado com allowlist de egresso — o backend local não isola host.
4. **Mensageria:** allowlist de números/IDs do staff, pareamento com expiração curta, rate limit, separação admin/regular. **Nenhum canal de hóspede aponta para essas instâncias.**
5. **Versão travada + SLA de patch de 72h para CVE alta.** Assine os avisos de segurança.
6. **Skills auto-geradas desabilitadas** para tudo que toque a Titan. Para aproveitar o loop de aprendizado, a skill gerada entra como **PR no git** com revisão humana antes de rodar.
7. **Orçamento por instância:** teto de tokens, limites de CPU/memória, rate limit de provedor.
8. **Memória como armazenamento não confiável e efêmero:** cifrada, expurgo programado, zero PII de hóspede, zero segredo. Fonte de verdade é o Postgres.
9. **Rede:** segmento isolado, egresso por allowlist (provedor de LLM + MCP + mensageria), sem rota para o banco.
10. **Nada irreversível sem confirmação:** cancelar reserva, revogar acesso, publicar em canal.
11. **Fiscal e dinheiro:** o agente enfileira, analisa e propõe. **Nunca** emite, cancela nota ou executa PIX.
12. **Transparência:** identificar-se como assistente quando exigido, oferecer humano sempre, respeitar janela de 24h e templates aprovados do WhatsApp.

### 9.12.6 Avaliação e Console de Automação

**Evals:** golden set versionado por agente (casos reais anonimizados com ação esperada) rodando no CI a cada mudança de prompt, ferramenta ou modelo; rubricas (correção factual, aderência à política, tom, completude, escolha de ferramenta, escalonamento); tracing por conversa com custo, latência, ferramentas e veredito do Supervisor; canary de prompt com rollback; **registro de prompts versionados** (`packages/agents/prompts/*` com semver — prompt é artefato de release, não string em código).

**KPIs:** resolução sem humano · tempo até primeira resposta · escalonamento · precisão de conciliação sugerida · receita incremental de upsell · ΔRevPAR atribuível ao agente de revenue · horas-humano poupadas por 100 reservas · custo de IA por reserva · CSAT por canal.

**`(staff)/automacao`:** sliders de autonomia por agente e unidade · fila de aprovações pendentes com contexto · feed de tudo que os agentes fizeram, filtrável, com replay do trace · métricas e custo · guardrails ativos com quem alterou · kill switch. Toda ação de agente aparece na timeline da entidade com o rótulo do ator (`agent:concierge v1.4`) — indistinguível, em rastreabilidade, de uma ação humana.

---

# 10. REQUISITOS NÃO FUNCIONAIS

| Categoria | Alvo (VPS única) |
|---|---|
Disponibilidade | **99,5%** com janela de manutenção anunciada. Degradação graciosa se canal ou gateway cair. 99,9% exige separar banco e ter réplica — planejado para a Fase 5 |
Latência | p95 < 300 ms em leitura de API; cotação < 800 ms; busca com mapa < 1 s |
Escala | `UNIDADES_ANO_3` unidades, 10× em picos de busca (Cloudflare absorve o público), ~500k noites-calendário |
Consistência | **Zero double booking**, provado por teste de concorrência sob PgBouncer |
Segurança | OWASP ASVS L2, MFA no cockpit, RBAC/ABAC, segredos cifrados (SOPS/Infisical), SAST+DAST+SCA no CI, Postgres sem porta pública |
LGPD | Mapeamento de dados, base legal por finalidade, minimização, consentimento granular, retenção com exceção fiscal de 5 anos, atendimento a titular, cifragem de documentos, DPIA |
Observabilidade | Trace ponta a ponta reserva→pagamento→nota→repasse; SLO por integração; alertas acionáveis; **exportação para fora da VPS** |
Testes | ≥80% no domínio; contract tests por adapter; e2e nos fluxos de dinheiro; k6; teste de concorrência de reserva; golden files de XML fiscal; matriz de autorização; teste de payload de escopo |
Backup/DR | RPO ≤ 5 min (WAL contínuo), **RTO 2–4 h documentado e cronometrado**; ensaio de restauração trimestral em VPS limpa |

---

# 11. ANTI-PADRÕES A REJEITAR

- Preço calculado ou validado no cliente.
- Disponibilidade como booleano por dia, sem *range type* e sem constraint no banco.
- Financeiro como tabela única de "entradas e saídas", sem contrapartida contábil.
- Emissão fiscal sincronizada no request do checkout.
- `if canal == 'airbnb'` espalhado pelo domínio em vez de adapters.
- Alíquota, código de serviço, regra de retenção ou prazo de canal em constante de código.
- Webhook processado sem verificar assinatura ou sem deduplicação.
- `SET` sem `LOCAL` para contexto de tenant sob PgBouncer.
- Float para dinheiro; timestamp UTC para data de estadia.
- Scraping de OTA apresentado como "pesquisa de preços" sem autorização.
- Modelo de ML em produção sem versionamento e sem monitoramento de drift.
- Foto como "anexo" em vez de evidência com procedência e nível de garantia.
- Reprovar serviço sem apontar item específico.
- Consequência financeira decidida por modelo sem confirmação humana.
- Aprovação de valores por botão de chat.
- Saque de gateway habilitado por API.
- Backup só na mesma VPS. Documento fiscal só em disco local.
- Segredo em `.env` comitado; PII em log; PAN em qualquer lugar.
- Rota de exclusão de evidência para qualquer papel.
- Invariante que só existe como instrução no `CLAUDE.md` quando poderia ser hook de bloqueio ou constraint de banco.
- Duas faixas paralelas escrevendo no mesmo diretório.
- Auditoria de portão corrigida na integração em vez de devolvida à faixa que gerou o problema.
- Subagente auditor com permissão de `Edit` — quem relata não conserta.

---

# 12. ENTREGÁVEIS

1. `/docs/adr/` — ADRs numerados. Mínimo: **0001** estilo arquitetural · **0002** topologia VPS única, disponibilidade e DR · **0003** stack e versões travadas · **0004** estratégia de canais · **0005** orquestração de pagamentos · **0006** trilha fiscal · **0007** multi-tenancy e RLS sob pooling · **0008** autenticação e autorização · **0009** hardening das instâncias de agente · **0010** por que Concierge/Vendas/Risco não rodam em Hermes/OpenClaw · **0011** integração de ponto e folha (não construir) · **0012** estratégia mobile em três níveis · **0013** captura em navegador e limitações por plataforma · **0014** fonte de dados de pricing · **0015** região Contabo, latência ao Brasil, transferência internacional de dados e gatilho do plano B no Brasil · **0016** direção visual e as três rejeições de 5.9.3 · **0017** MCPs instalados, escopos e separação dev/produção · **0018** tape chart — construir em canvas ou licenciar · **0019** orquestração no Claude Code: formato verificado do ferramental, política de escolha de modelo, propriedade de arquivos, faixas paralelas autorizadas, hooks de bloqueio e protocolo de integração.
2. **`CLAUDE.md` + `.claude/` + `.mcp.json`** — contrato raiz e por pacote, `agents/*.md` (os nove subagentes da 5.11.3), **`hooks/*` (os onze bloqueios da 5.11.4)**, `commands/*`, `skills/*/SKILL.md`, `settings.json` com as permissões de 5.10.3, e `docs/{invariantes,anti-padroes,fase-atual}.md`. **É o primeiro entregável de código da Fase 0**, antes de qualquer migration: sem ele cada subagente reinventa as convenções, e sem os hooks as invariantes voltam a depender de boa vontade.
3. `/docs/domain/` — modelo de domínio, glossário pt-BR↔inglês, diagramas de contexto e máquinas de estado (Mermaid).
4. `/docs/openapi.yaml` — contrato versionado.
5. `/db/migrations/` — SQL versionado + seed com 20 unidades, 400 reservas, 12 meses de histórico, 3 proprietários, 5 prestadores, 60 SKUs e evidência de exemplo.
6. `/infra/` — docker-compose, Caddy/Traefik, PgBouncer, pgBackRest, SOPS, script de deploy sem downtime, script de restauração.
7. Código dos módulos na ordem do roadmap, com testes.
8. `/docs/integrations/` — por integração: pré-requisitos, credenciais, sandbox, mapeamento de campos, fixtures, runbook de falha.
9. `/docs/runbook.md` e `/docs/runbook-pagamentos.md` — overbooking detectado, nota rejeitada, gateway fora, canal dessincronizado, chargeback, congelamento de repasse, restauração de banco, VPS perdida.
10. `/docs/roadmap.md` — fases, estimativas, dependências externas (certificações) com prazo de risco explícito.

---

# 13. ROADMAP

| Fase | Escopo | Portão de saída |
|---|---|---|
**F0** Fundação (2 sem) | Monorepo, Compose na VPS, CI, RLS multi-tenant, identity com MFA, PgBouncer, pgBackRest, observabilidade, `CLAUDE.md` + `.claude/**` completo com hooks ativos, ADRs 1–19 | Deploy sem downtime; **teste de isolamento de tenant sob pooling passa**; restauração de backup cronometrada; **cada hook de 5.11.4 provado com um caso que ele bloqueia** |
**F1** Núcleo (3 sem) | `availability` com `EXCLUDE`, rates, cotação, reserva no cockpit, tape chart v1 | 100 reservas simultâneas na mesma noite → **exatamente 1 confirma** |
**F2** Direto (3 sem) | Storefront, checkout, 2 gateways sandbox, ledger básico, **`/aprovacoes`** | Reserva ponta a ponta com lançamentos conciliados |
**F3** Distribuição (3 sem) | iCal + agregador para os 4 canais, ingestão, reconciliação | Reserva de OTA bloqueia os outros canais em < 5 min; divergência detectada |
**F4** Fiscal (2 sem) | Provedor, RPS/NFS-e, cofre WORM, cancelamento | 100% dos check-outs com nota válida em homologação; zero duplicidade sob retry forçado |
**F5** Financeiro (3 sem) | Competência/caixa, AP/AR, conciliação de settlement, repasse, portal do proprietário, **camadas 2–7 de 9.4.1**, separação do banco em VPS própria | DRE fecha com extrato simulado ao centavo; **débito sem aprovação é impossível** |
**F6** Limpeza e evidência (4 sem) | `housekeeping/`, `evidence/`, checklists, captura guiada, revisão, I9, viradas, dossiê | Alteração de 1 byte detectada; foto reaproveitada sinalizada; check-in em unidade `dirty` bloqueado; zero sinistro perdido por prazo em simulação |
**F7** Suprimentos e prestadores (3 sem) | `supply/`, `vendors/`, portal do prestador, retenções, reposição preditiva | Saldo reconstruído dos movimentos bate com o materializado; retenções conferidas pelo contador |
**F8** Pricing (4 sem) | Comp set, forecast, otimização com **piso vindo do custo variável real**, explicabilidade, backtest | Backtest com ΔRevPAR ≥ 0 vs. preço fixo; explicação disponível para toda noite |
**F9** Pessoas e campo (2 sem) | `workforce/`, app nativo de campo, custódia de acessos | Ciclo completo de estadia executado no app; revogação no desligamento provada |
**F10** Agentes (3 sem) | MCP, Concierge N1 no runtime próprio, Hermes no plano operador | Acurácia no golden set ≥ meta; custo por conversa medido; injeção de prompt bloqueada no corpus de teste |
**Paralelo contínuo** | Certificações Booking/Expedia/Airbnb; troca do agregador por adapters diretos | Certificação por área funcional |

Suprimentos vem **antes** do pricing: sem custo variável real, o motor precifica com piso adivinhado.

**Faixas paralelas autorizadas por fase** (conforme 5.11.3 — todo o resto é serializado):

| Fase | Fila de um (serializado) | Paralelo autorizado |
|---|---|---|
**F0** | `CLAUDE.md` + `.claude/**` → `packages/domain` → `packages/db` → RLS | `infra/**` e tokens de design (`packages/ui`) correm ao lado |
**F1** | migrations de `availability` e `rates`; máquina de estados | tape chart (gere 2–3 variantes e compare) · teste de concorrência · seed |
**F2** | schema do ledger · matriz de autorização | **4 adapters de gateway em 4 worktrees** · storefront · `/aprovacoes` |
**F3** | mapeamento canal↔unidade | **4 adapters de canal em 4 worktrees** · reconciliação · painel de saúde |
**F4** | numeração de RPS · idempotência fiscal | cofre WORM · templates de nota · runbook de rejeição |
**F5** | schema do ledger (só aditivo) · camadas 2–5 de 9.4.1 | portal do proprietário · conciliação de settlement · PDFs |
**F6** | `packages/evidence` (I10) | captura no navegador · app de campo · editor de checklist · painel de revisão |
**F7** | `stock_movement` e CMPM | portal do prestador · motor de retenções · reposição preditiva |
**F8** | — | comp set · forecast · otimização · backtest: tudo paralelo, em worktrees separadas |
**F9** | custódia de acessos | app de campo · escala · produtividade |
**F10** | catálogo do `titan-mcp` | Concierge · evals · console de automação · hardening do Hermes |

Regra que atravessa tudo: **duas faixas nunca compartilham diretório.** Se o plano exigir isso, a fase está mal cortada — recorte antes de executar.

---

# 14. PRIMEIRA RESPOSTA ESPERADA

Não escreva código nesta rodada. Não delegue nada ainda — a Rodada 0 é do agente principal, sozinho, porque é ela que define o contrato que os subagentes vão seguir.

Entregue, nesta ordem:

1. **Até 8 perguntas** de maior impacto, priorizadas — especialmente enquadramento tributário, quem emite a nota, vínculo da camareira, contrato de administração (quem paga o quê), alçadas, e se já existe contrato com OTA ou agregador.
2. **Modelo de domínio** em Mermaid: entidades, agregados, invariantes I1–I10, eventos.
3. **ADR-0001 a ADR-0019** preenchidos com recomendação e justificativa.
4. **Roadmap ajustado** com dependências externas e riscos datados, e — para cada fase — **quais faixas rodam em paralelo e quais são serializadas**, conforme 5.11.3.
5. **Matriz de riscos** (probabilidade × impacto) com mitigação — destacando acesso a API de canal, risco fiscal, perda de VPS/backup, dados de pricing, e conflito de integração entre faixas paralelas.
6. **Conteúdo proposto de `CLAUDE.md` raiz, `docs/invariantes.md` e `docs/anti-padroes.md`**, para eu revisar antes de virarem lei do repositório.
7. **A política de modelo que você pretende aplicar** (5.11.2): qual subagente em qual modelo, e por quê. Uma linha cada.

Aguarde meu "ok".

**Depois do ok, o ciclo de cada fase é sempre este:**

```
1. /fase <n>  → plan mode: plano numerado, arquivos a tocar, faixas identificadas
               e o modelo escolhido para cada faixa, com justificativa de uma linha
2. Eu aprovo o plano
3. git worktree por faixa de ESCRITA autorizada em 5.11.7
   subagentes via Task para auditoria, pesquisa e faixas de diretório exclusivo
4. Execução paralela SÓ onde os diretórios são disjuntos
5. /portao → invariant-auditor + security-reviewer + convention-checker em paralelo
             (+ a11y-reviewer se houver UI, + fiscal-specialist se houver fiscal)
             sem FALHA
6. Merge na ordem domínio → banco → serviços → UI
7. /fechar-fase → verifica o portão de saída da seção 13, atualiza ADRs e fase-atual.md
8. Só então a fase seguinte
```

Uma fase por vez. Faixa que falhar em auditoria volta para a faixa — não se corrige na integração.

---

# 15. APÊNDICE — DECISÕES HUMANAS PENDENTES

Sem estas, o agente codifica premissas erradas e você refaz.

| # | Decisão | Com quem |
|---|---|---|
1 | **Locação por temporada ou hospedagem?** E como o regime específico de bens imóveis da LC 214/2025 afeta a transição de 2026 | Contador/tributarista |
2 | **Quem emite a nota: Titan ou proprietário?** | Contador + jurídico |
3 | **Camareira: CLT, PJ ou empresa terceirizada?** Muda retenções, ponto, escala, risco de vínculo e custo variável por estadia | Contador + jurídico |
4 | **Contrato de administração: quem paga o quê** — comissão, amenities, material de limpeza, enxoval, manutenção até valor X, depreciação. **É a especificação do extrato de repasse** | Você + jurídico |
5 | **Alçadas de aprovação** — compra sem cotação, OS sem orçamento, reembolso sem step-up, repasse com dupla aprovação, ajuste de estoque | Você |
6 | **Enxoval é da Titan ou do proprietário?** | Você + jurídico |
7 | **Cobrar consumo do hóspede** (minibar/mercadinho)? Adiciona tratamento fiscal de mercadoria sobre operação de serviço | Você + contador |
8 | **Quem inspeciona a limpeza?** Supervisor dedicado, inspeção cruzada, ou o gestor pelas fotos no cockpit | Você |
9 | **Vistoria de chegada compartilhada com o hóspede?** Recomendo sim — reduz disputa e é justo. Exige fotos impecáveis, sempre | Você |
10 | **Geolocalização de equipe e prestador: até onde?** Sugiro geo apenas no instante da captura, sem rastreamento, comunicado com transparência | Você + jurídico |
11 | **Aceita evidência A1 para retenção de caução?** Recomendo exigir A2 | Você |
12 | **Quem escreve os checklists?** São o padrão de qualidade da Titan em forma executável. O agente monta a ferramenta; **o padrão é seu** | Você + camareira mais experiente |
13 | **Papel de cada gateway.** Quatro em produção multiplicam a conciliação. Sugestão: começar com dois (um BRL/PIX + Stripe para estrangeiro) e ativar os demais pelo roteador quando o volume justificar | Você |
14 | **Tape chart: construir ou licenciar?** Maior incerteza de esforço da camada de UI | Você + agente |
