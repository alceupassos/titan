# ADR-0004 — Estratégia de canais (Channel Manager)

**Status:** Aceito, com decisão real da Fase 3 (pergunta 6 de `docs/decisoes-de-negocio.md`
respondida) — a Titan já tem contrato/conta com os 4 canais; sem agregador terceirizado.

## Contexto
Airbnb não tem API pública aberta (só iCal one-way ou Partner API sob aprovação de meses).
Booking.com, Expedia e VRBO exigem registro como parceiro de conectividade e certificação por
área, também da ordem de meses. Nenhuma dessas capabilities deve ser tratada como confirmada sem
checar a documentação vigente de cada programa. A Titan já opera contas reais nos 4 canais
(Airbnb, Booking, VRBO, Expedia) — o cenário original deste ADR ("sem contrato") não se aplica.

## Decisão
Porta única (`ChannelAdapter`) com **implementações próprias, sem agregador terceirizado**
(decisão explícita do usuário — não Hostaway/Guesty/Beds24/etc.):
- `IcalChannelAdapter` — backbone seguro para os 4 canais: disponibilidade one-way via feed iCal,
  funciona hoje, sem certificação, sem risco de ToS. **Não cobre tarifa nem reserva estruturada.**
- `BrowserAutomationChannelAdapter` (Airbnb) — automação via Playwright no painel de host,
  cobrindo tarifa/reserva estruturada que o iCal não alcança. **Decisão de risco explícita,
  registrada em `docs/adr/0020-automacao-navegador-canais.md`**: tipicamente viola os ToS do
  Airbnb, risco real de suspensão de conta, assumido conscientemente pelo usuário após eu
  perguntar diretamente.
- Certificação direta via API oficial (Partner API do Airbnb, Connectivity APIs de
  Booking/Expedia/VRBO) permanece o alvo de longo prazo, correndo em paralelo contínuo — quando
  disponível, substitui o adapter de automação de navegador pela mesma porta, sem mudar o
  contrato de domínio.

Adapters diretos por canal são implementações adicionais da mesma porta, plugáveis sem mudar o
contrato de domínio.

## Justificativa
Certificação direta é dependência externa não controlável (meses, sujeita a aprovação de
terceiro). A Fase 3 não pode ficar bloqueada por isso — e o usuário decidiu não introduzir uma
terceira dependência externa (agregador comercial) quando já opera as contas diretamente.

## Consequências
- Mapeamento unidade↔listing auditável com detecção de drift; reconciliação diária.
- Fila por unidade com coalescência de deltas; circuit breaker + DLQ por canal.
- Reserva externa gera reserva de domínio completa, com pagamento marcado "coletado pelo canal" e
  comissão provisionada no ledger.
- O adapter de automação de navegador (Airbnb) é estruturalmente frágil (quebra sem aviso se o
  Airbnb mudar o painel) e carrega risco de suspensão de conta — ver ADR-0020 para as mitigações
  de design que reduzem impacto, sem eliminar o risco.
