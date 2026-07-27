# ADR-0008 — Autenticação e autorização

**Status:** Proposto (Rodada 0) — aguardando "ok"

## Contexto
Quatro portais (cockpit, proprietário, hóspede, prestador) no mesmo monorepo, com risco real de
vazamento de dado entre papéis e entre tenants se a autorização depender só de checagem na UI.

## Decisão
Better Auth self-hosted (organization, two-factor, passkey, magic-link, impersonation) para
autenticação. CASL isomórfico (servidor/UI) **mais** RLS no PostgreSQL como segunda camada
independente de autorização.

## Justificativa
Duas camadas independentes cobrem o caso em que um bug de aplicação tentaria vazar dado entre
tenants ou papéis — RLS garante mesmo que a checagem de CASL falhe.

## Consequências
- Toda rota de servidor e Server Action começa com `const ability = await getAbility()` mais
  checagem explícita; ausência de botão na UI não é autorização.
- Matriz `[persona × rota × ação] → permitido/negado` (seção 7.3) vira teste `pnpm test:auth`
  com falha de build em qualquer divergência.
- MFA obrigatório para staff Titan e proprietário com permissão financeira.
- Impersonation sempre com trilha de auditoria e banner permanente.
