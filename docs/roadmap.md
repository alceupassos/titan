# Roadmap — fases, dependências externas, faixas paralelas

Fonte: `prompt.md` seção 13, ajustado na Rodada 0 com as dependências das 8 perguntas de
`docs/decisoes-de-negocio.md` e os riscos datados da matriz de risco.

| Fase | Duração | Escopo | Portão de saída | Faixas paralelas autorizadas | Dependência externa / risco |
|---|---|---|---|---|---|
| F0 Fundação | 2 sem | Monorepo, Compose na VPS, CI, RLS multi-tenant, MFA, PgBouncer, pgBackRest, observabilidade, `CLAUDE.md`+`.claude/**` com hooks ativos, ADRs 1–19 | Deploy sem downtime; teste de isolamento de tenant sob pooling passa; restauração de backup cronometrada; cada hook do 5.11.4 provado por um caso que ele bloqueia | `infra/**` e tokens de design (`packages/ui`) correm junto | — |
| F1 Core | 3 sem | `availability` com `EXCLUDE`, tarifas, cotação, reserva no cockpit, tape chart v1 | 100 reservas simultâneas mesma noite → exatamente 1 confirma | Tape chart (2-3 variantes) · teste de concorrência · seed | Decisão do ADR-0018 |
| F2 Direto | 3 sem | Storefront, checkout, 2 gateways sandbox, ledger básico, `/aprovacoes` | Reserva ponta a ponta com lançamentos reconciliados | 4 adapters de gateway em 4 worktrees · storefront · `/aprovacoes` | Pergunta 8 (quais 2 gateways) |
| F3 Distribuição | 3 sem | iCal + agregador para os 4 canais, ingestão, reconciliação | Reserva de OTA bloqueia outros canais em <5 min; divergência detectada | 4 adapters de canal em 4 worktrees · reconciliação · dashboard de saúde | Certificação Airbnb/Booking/Expedia/VRBO corre em paralelo contínuo; pergunta 6 |
| F4 Fiscal | 2 sem | Provedor, RPS/NFS-e, cofre WORM, cancelamento | 100% dos checkouts com nota válida em homologação; zero duplicidade sob retry forçado | Cofre WORM · templates de nota · runbook de rejeição | **Bloqueada pelas perguntas 1 e 2** |
| F5 Financeiro | 3 sem | Regime caixa/competência, AP/AR, conciliação de liquidação, repasse, portal do proprietário, camadas 2–7 do 9.4.1, banco separado em VPS própria | DRE fecha ao centavo vs. extrato simulado; débito sem aprovação é impossível | Portal do proprietário · conciliação de liquidação · PDFs | Pergunta 4 (contrato de administração) |
| F6 Limpeza e Evidência | 4 sem | `housekeeping/`, `evidence/`, checklists, captura guiada, revisão, I9, viradas, dossiê | Alteração de 1 byte detectada; foto reutilizada sinalizada; check-in bloqueado em unidade `dirty`; zero prazo de sinistro perdido em simulação | Captura no navegador · app de campo · editor de checklist · painel de revisão | Pergunta 3 (vínculo da camareira) |
| F7 Suprimentos e Prestadores | 3 sem | `supply/`, `vendors/`, portal do prestador, retenções, reposição preditiva | Saldo reconstruído dos movimentos bate com saldo materializado; retenções validadas por contador | Portal do prestador · motor de retenção · reposição preditiva | Pergunta 7 (enxoval Titan ou proprietário) |
| F8 Pricing | 4 sem | Comp set, forecast, otimização com piso do custo variável real, explicabilidade, backtest | Backtest ΔRevPAR ≥ 0 vs. preço fixo; explicação disponível por noite | Comp set · forecast · otimização · backtest, todos paralelos em worktrees separados | **F7 precisa vir antes** — sem custo variável real, o piso é chutado |
| F9 Pessoas e Campo | 2 sem | `workforce/`, app de campo nativo, custódia de acesso | Ciclo completo de estadia executado no app; revogação de desligamento provada | App de campo · escala · produtividade | — |
| F10 Agentes | 3 sem | MCP, Concierge N1 em runtime próprio, Hermes no plano operador | Acurácia do golden-set ≥ alvo; custo por conversa medido; injeção de prompt bloqueada no corpus de teste | Catálogo `titan-mcp` · Concierge · evals · console de automação · hardening do Hermes | Continuidade do Nous Research (Hermes) — monitorar |
| Contínuo | — | Certificações Booking/Expedia/Airbnb; troca do agregador por adapters diretos | Certificação por área funcional | — | Meses de aprovação por canal (não controlável) |

## Matriz de riscos (probabilidade × impacto)

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Acesso a API de canal (Airbnb sem API aberta; Booking/Expedia/VRBO exigem certificação de meses) atrasa F3 | Alta | Alto | ADR-0004: agregador cobre os 4 canais desde o MVP; certificação direta corre em paralelo contínuo |
| Classificação fiscal errada (locação vs. hospedagem) sob a transição CBS/IBS 2026 | Média | Alto | `tax_rules` versionada por vigência + validação de contador obrigatória antes do portão F4 |
| Perda de VPS/backup (banco e app na mesma máquina) | Baixa | Crítico | pgBackRest com WAL contínuo, RPO ≤5min, RTO 2-4h cronometrado, ensaio trimestral, backup em provedor distinto (3-2-1) |
| Dado de pricing por scraping não autorizado | Baixa (se ADR-0014 seguido) | Alto (legal/banimento) | Proibição explícita; só sinais próprios/públicos/licenciados |
| Conflito de integração entre faixas paralelas (merge de worktrees) | Média | Médio | Matriz de propriedade de arquivos (5.11.3); achado de auditoria volta para a faixa de origem |
| Latência Contabo (sem região SP) prejudica conversão do storefront | Média | Médio | Cloudflare + cache agressivo/ISR (PoP GRU); Plano B (ADR-0015) documentado, não ativado no dia 1 |
| Vulnerabilidade em framework de agente (CVE-2026-25253 OpenClaw; single-tenancy Hermes) | Média | Alto | ADR-0009/0010: Hermes só no plano operador com allowlist; OpenClaw restrito a monitoramento read-only |
| Capability de gateway/canal divergente da documentação assumida | Alta (nada verificado ainda) | Médio | `adapter-builder` declara incerteza e lista o que falta confirmar antes de implementar |
| Vínculo empregatício caracterizado por engano (camareira/prestador PJ com subordinação de fato) | Média | Alto (trabalhista) | Seção 9.10.6: checklist é especificação de escopo, não controle de jornada; decisão final é jurídica (pergunta 3) |
| Estouro de esforço da tape chart (maior incerteza de UI do projeto) | Média | Médio | ADR-0018: 2-3 variantes em F1 antes de comprometer F8 |

**Nota de dependência crítica:** F7 (Suprimentos) precede F8 (Pricing) — sem custo variável real
por estadia, o piso de preço do motor de pricing seria uma constante chutada, violando o próprio
requisito da seção 9.7.
