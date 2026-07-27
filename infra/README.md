# infra/

Docker Compose é a fonte de verdade da infraestrutura — se o Dokploy/Coolify do painel virar
obstáculo, a stack sobe à mão em qualquer máquina a partir daqui (seção 4.4.6 do prompt único).

## Segredos — TODO

Nenhum SOPS/age ou instância Infisical existe ainda. Estado atual: `.env` local (gitignored,
nunca commitado — `block-secrets.mjs` bloqueia qualquer `.env` com valor real). **Isso é
aceitável para desenvolvimento local, não para produção.** Antes de qualquer deploy real:
escolher SOPS+age (arquivo cifrado no repo) ou Infisical auto-hospedado, conforme seção 4.2 item 8
do prompt único. Registrar a escolha em adendo ao ADR-0002.

## Uso local (F0)

```bash
cp .env.example .env   # preencher POSTGRES_PASSWORD localmente
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml ps   # todos "healthy"
```

## Gap conhecido

VPS Contabo real ainda não provisionada (ver docs/fase-atual.md). Tudo aqui roda local via Docker
Desktop até então — os scripts de prova do portão de F0 (`scripts/deploy-swap.sh`,
`scripts/backup-restore-drill.sh`) são substitutos locais, não a prova na VPS real.
