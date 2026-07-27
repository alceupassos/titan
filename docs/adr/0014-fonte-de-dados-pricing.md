# ADR-0014 — Fonte de dados de pricing

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
Scraping de Airbnb/Booking para pesquisa de preço viola os termos de serviço dessas plataformas e
cria risco legal e de banimento. É explicitamente proibido pela spec (anti-padrão #10).

## Decisão
Ordem de prioridade das fontes do motor de pricing (seção 9.7):
1. **Sinais próprios** (histórico de pickup, conversão busca→reserva, elasticidade observada,
   rejeição de cotação, lead time) — custo zero, risco zero, mais valioso.
2. **Sinais públicos** (feriados/eventos, clima, calendário escolar, tarifas de hotel via API de
   parceiro contratado).
3. **Dado licenciado** (AirDNA, Key Data, Lighthouse, Transparent, ou motores como PriceLabs,
   Beyond, Wheelhouse) como fase 2 do motor, modelado como `MarketDataProvider` plugável.
4. Qualquer coleta web só se contratualmente autorizada, respeitando `robots.txt`, com
   confirmação humana explícita antes de implementar qualquer coletor.

## Justificativa
Sinal próprio já cobre a maior parte do valor sem risco algum; dado licenciado é opcional, não
pré-requisito do MVP de pricing.

## Consequências
- Nenhum coletor é implementado sem confirmação humana explícita, registrada.
- `MarketDataProvider` como porta plugável evita acoplar o motor a um fornecedor específico.
