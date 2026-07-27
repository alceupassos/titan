# ADR-0004 — Estratégia de canais (Channel Manager)

**Status:** Proposto (Rodada 0) — aguardando "ok" e resposta à pergunta 6 de `docs/decisoes-de-negocio.md`

## Contexto
Airbnb não tem API pública aberta (só iCal one-way ou Partner API sob aprovação de meses).
Booking.com, Expedia e VRBO exigem registro como parceiro de conectividade e certificação por
área, também da ordem de meses. Nenhuma dessas capabilities deve ser tratada como confirmada sem
checar a documentação vigente de cada programa.

## Decisão
Porta única (`ChannelAdapter`) com **duas implementações desde o MVP**:
- `IcalChannelAdapter` — funciona hoje, sem certificação, disponibilidade one-way.
- `AggregatorChannelAdapter` — mira um channel manager intermediário (Hostaway, Guesty, Beds24,
  Rentals United, NextPax ou Lodgify — avaliar e escolher 1) cobrindo os 4 canais sob um único
  contrato enquanto as certificações diretas correm em paralelo contínuo.

Adapters diretos por canal são implementações adicionais da mesma porta, plugáveis sem mudar o
contrato de domínio.

## Justificativa
Certificação direta é dependência externa não controlável (meses, sujeita a aprovação de
terceiro). A Fase 3 não pode ficar bloqueada por isso.

## Consequências
- Mapeamento unidade↔listing auditável com detecção de drift; reconciliação diária.
- Fila por unidade com coalescência de deltas; circuit breaker + DLQ por canal.
- Reserva externa gera reserva de domínio completa, com pagamento marcado "coletado pelo canal" e
  comissão provisionada no ledger.
- Depende da pergunta 6 (contrato existente com OTA/agregador) para escolher o agregador e a
  ordem de certificação direta.
