# ADR-0001 — Estilo arquitetural

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
Cinco superfícies (storefront, channel manager, cockpit, portal do proprietário, portal do
prestador) compartilham domínio fortemente acoplado: ledger, fiscal e evidência se referenciam
mutuamente em quase toda operação (ex.: check-out gera lançamento, pode gerar nota, pode liberar
caução condicionado a evidência). Equipe pequena, VPS única.

## Decisão
Monólito modular por bounded contexts (`packages/*`), não microsserviços. Cada contexto
(`identity`, `inventory`, `availability`, `rates`, `booking`, `distribution`, `payments`,
`ledger`, `fiscal`, `approvals`, `housekeeping`, `evidence`, `supply`, `vendors`, `workforce`,
`crm`, `pricing_intel`, `owner_portal`, `analytics`) vive em seu próprio pacote com fronteira de
import checada em CI.

## Justificativa
VPS única e equipe pequena tornam custo de rede/deploy de microsserviços puro overhead. O
acoplamento de domínio real (ledger↔fiscal↔evidence) é melhor resolvido por módulos bem
isolados dentro do mesmo processo do que por chamadas de rede entre serviços.

## Consequências
- `packages/*` com regras de import (ESLint/dependency-cruiser) impedindo import cruzado indevido.
- Extração futura para serviço próprio continua possível porque os contextos já nascem isolados.
- `apps/web`, `apps/console`, `apps/worker`, `apps/mcp`, `apps/field` consomem os pacotes, não
  reimplementam domínio.
