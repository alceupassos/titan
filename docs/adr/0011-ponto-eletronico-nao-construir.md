# ADR-0011 — Ponto eletrônico e folha: integrar, não construir

**Status:** Proposto (Rodada 0) — depende da pergunta 3 de `docs/decisoes-de-negocio.md` para o
desenho final de `workforce/`

## Contexto
Se a Titan tiver equipe própria em CLT, um relógio de ponto autoconstruído se qualifica como
**REP-P sob a Portaria MTP 671/2021** — exige AFD/AEJ, marcações imutáveis e recibo ao
trabalhador. É um produto inteiro com risco trabalhista, não uma tela a mais do cockpit.

## Decisão
**Não construir** ponto eletrônico oficial nem folha de pagamento. **Integrar** com sistema
certificado (Ahgora, Pontomais, Tangerino, Senior) ou com a contabilidade.

## Justificativa
O custo de fazer errado (multa, passivo trabalhista) é desproporcional ao valor de ter isso
dentro do próprio cockpit.

## Consequências
- `workforce/` cobre registro operacional, escala, produtividade e custódia de acesso — não
  ponto oficial nem cálculo de folha.
- Para `contractor` (vínculo PJ): sem controle de jornada, aceite/recusa de OS por resposta a
  SLA, sem exclusividade — UI sinaliza quando uma configuração aumenta risco de vínculo de fato.
- Decisão final sobre o desenho de `employee` vs. `contractor` depende da resposta à pergunta 3.
