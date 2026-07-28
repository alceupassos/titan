# ADR-0020 — Automação via navegador para o canal Airbnb (decisão de risco assumida)

**Status:** Aceito, como decisão de negócio explícita do usuário — não é recomendação técnica.

## Contexto

O Airbnb não tem API pública de reservas/tarifas sem aprovação no Partner Program, um processo de
meses sem SLA (seção 9.2 do prompt único, ADR-0004). A Titan já tem contrato/conta real com
Airbnb, Booking, VRBO e Expedia (pergunta 6 de `docs/decisoes-de-negocio.md`, respondida na
abertura da Fase 3) e decidiu não usar um agregador terceirizado — construir o próprio agregador
em `packages/channels`. Para cobrir o que o iCal não alcança no Airbnb (tarifas e reservas
estruturadas, já que iCal só sincroniza disponibilidade, unidirecional), o usuário pediu
automação via navegador (Playwright/"browser.ai") no painel de host, usando a conta própria da
Titan.

**Fui perguntado diretamente antes de implementar**: automatizar o painel de host de uma OTA via
navegador — mesmo autenticado com a conta legítima do próprio operador — tipicamente viola os
Termos de Serviço da plataforma (a maioria das OTAs proíbe acesso automatizado/bot ao painel,
independentemente de quem é o dono da conta). O risco real é **suspensão da conta Airbnb da
Titan**, não uma falha técnica reversível com um patch. Perguntei isso explicitamente ao usuário
antes de prosseguir; a resposta foi: construir mesmo assim nesta fase, ciente do risco.

## Decisão

Implementar `packages/channels/src/browser-automation/` como adapter Airbnb via Playwright,
isolado do resto do sistema, com as seguintes mitigações de design — que **reduzem impacto de
falha/detecção, não eliminam o risco de ToS**:

1. **Isolamento**: módulo próprio, nunca no caminho crítico sozinho. Se a automação falhar ou for
   bloqueada pelo Airbnb, o resto do sistema (iCal para os outros 3 canais, ledger, cockpit)
   continua funcionando — circuit breaker desliga só esse adapter após N falhas consecutivas.
2. **Credenciais**: só via variável de ambiente (`AIRBNB_HOST_EMAIL`/`AIRBNB_HOST_PASSWORD` ou
   equivalente), nunca hardcoded, nunca logadas — mesmo padrão de segredo já usado para gateways
   de pagamento (`docs/runbook-pagamentos.md`).
3. **Throttling conservador**: intervalos generosos entre ações no painel, nunca rajada de
   requisições — reduz (não elimina) a chance de detecção como tráfego automatizado.
4. **Fragilidade estrutural documentada, não escondida**: este adapter quebra a qualquer momento
   que o Airbnb mudar o HTML/fluxo do painel de host, sem aviso e sem SLA de fornecedor — ao
   contrário de uma API oficial versionada. Isso é uma debilidade permanente da abordagem, não um
   bug a corrigir.
5. **Kill switch manual**: o cockpit (`/distribuicao`) tem um controle explícito para desligar a
   automação desse canal especificamente, sem precisar de deploy, para o dia em que o Airbnb
   sinalizar/bloquear a conta e a operação precisar reagir rápido.
6. **Nenhum dado de terceiro é raspado além do necessário para a própria operação da Titan** —
   este adapter só lê/escreve os próprios listings da Titan no próprio painel de host, nunca
   coleta preço de concorrente nem dado de outro anfitrião (isso seria o anti-padrão #10:
   "Scraping de OTA apresentado como 'pesquisa de preço' sem autorização" — não é o que este ADR
   cobre).

## Justificativa

O usuário pesou o risco de suspensão de conta contra o custo/tempo de esperar meses por aprovação
no Partner Program (ou não ter automação nenhuma de tarifa/reserva para o canal de maior volume)
e decidiu prosseguir. Meu papel aqui foi garantir que a decisão fosse tomada com informação clara
do risco, não construir em silêncio assumindo que "funciona hoje" significa "sem risco".

## Consequências

- Se a conta Airbnb da Titan for suspensa ou o painel bloquear acesso automatizado, este adapter
  para de funcionar até uma intervenção manual — não há caminho de recurso técnico contra a
  decisão do Airbnb.
- Nenhum teste desta sessão roda contra o Airbnb real (sem conta configurada nesta máquina) — só
  contra fixtures de HTML locais. A fragilidade real do adapter só se revela em produção.
- Revisar este ADR se o Airbnb liberar acesso ao Partner Program para a Titan no futuro — nesse
  caso, migrar para a API oficial e desligar a automação de navegador, mesmo padrão de "adapter
  plugável pela mesma porta `ChannelAdapter`" já usado para os outros 3 canais.
