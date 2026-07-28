#!/usr/bin/env bash
# Cria o papel de aplicação NÃO-superusuário (docs/adr/0007, achado F-1 da auditoria de
# segurança da Fase 0). O papel POSTGRES_USER da imagem oficial (`titan`) é sempre superusuário
# — FORCE ROW LEVEL SECURITY nunca se aplica a ele, então RLS fica inerte se a aplicação conecta
# como `titan`. `titan_app` é quem a aplicação e o PgBouncer usam de fato; `titan` fica reservado
# para bootstrap/migrations administrativas (conexão direta, fora do PgBouncer).
set -euo pipefail

: "${TITAN_APP_PASSWORD:?TITAN_APP_PASSWORD precisa estar definida (ver infra/README.md)}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'titan_app') THEN
      CREATE ROLE titan_app LOGIN PASSWORD '$TITAN_APP_PASSWORD'
        NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    END IF;
  END
  \$\$;
EOSQL
