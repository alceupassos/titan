# ADR-0015 — Região Contabo, latência Brasil, transferência internacional e Plano B

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
Contabo não tem região na América do Sul. RTT aproximado de São Paulo: Alemanha ~190-220ms
(ruim), EUA Leste (Nova York) ~110-130ms (melhor opção), EUA Central/Oeste ~140-180ms.

## Decisão
**US East (Nova York)** como região padrão. Mitigação em camadas:
1. Cloudflare com cache agressivo do storefront — páginas públicas em ISR, servidas do PoP de
   GRU, não da VPS.
2. Cockpit/portais aceitam melhor a latência (uso profissional, sessões longas) — evitar
   *chattiness* (agrupar queries, Server Components).
3. Chamadas ao webservice da Prefeitura de SP e gateways: usar `EnvioLoteRPS` em lote, sempre
   assíncrono no `worker`.
4. Documentar a transferência internacional de dados no DPIA e na política de privacidade
   (LGPD permite com salvaguarda declarada — não é opcional).
5. **Plano B**, não ativado no dia 1: segundo servidor pequeno no Brasil (Magalu Cloud, Locaweb,
   Oracle Cloud São Paulo) rodando **apenas** o `worker` fiscal e o receptor de webhooks, ligado
   ao Postgres por rede privada ou VPN.

## Justificativa
Nuremberg é pior que Nova York para tráfego de São Paulo; o gatilho do Plano B deve estar
registrado agora para não virar decisão reativa sob pressão.

## Consequências
- Gatilho do Plano B: latência do webservice da Prefeitura ou reclamação de hóspede acima de um
  limiar a definir com dados reais de produção.
- DPIA obrigatório antes de qualquer dado de hóspede brasileiro trafegar para os EUA.
