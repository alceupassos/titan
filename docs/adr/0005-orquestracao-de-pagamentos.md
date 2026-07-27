# ADR-0005 — Orquestração de pagamentos multi-gateway

**Status:** Proposto (Rodada 0) — aguardando "ok" e resposta à pergunta 8 de `docs/decisoes-de-negocio.md`

## Contexto
Quatro gateways candidatos (Asaas, Stripe, Pagar.me, AbacatePay), cada um com capabilities que a
spec marca explicitamente como "a validar contra a documentação vigente" — nada aqui é tratado
como contrato confirmado.

## Decisão
Roteador declarativo por método (PIX/cartão/boleto), moeda, país do emissor, valor, custo efetivo
(MDR + taxa fixa + custo de antecipação), taxa histórica de aprovação e necessidade de split; com
fallback em cascata e retry controlado. **Camada 0 do controle de movimentação de valores (seção
9.4.1) é o núcleo não negociável deste ADR: a plataforma nunca inicia saque do gateway para conta
bancária** — cada gateway fica configurado para liquidação automática numa única conta Titan
pré-cadastrada, com API de saque desabilitada.

## Justificativa
Mesmo com comprometimento total de app/banco/servidor/credencial, nenhum saque pode ser desviado
se a API de transferência do gateway estiver desabilitada e a liquidação for automática para uma
conta fixa.

## Consequências
- Porta por gateway com contract tests Pact + fixtures de sandbox antes de qualquer produção.
- Idempotência ponta a ponta (`Idempotency-Key` por intent, dedupe de webhook por `event_id`).
- Depende da pergunta 8 para os dois gateways de lançamento (F2); demais entram pelo roteador
  quando o volume justificar.
