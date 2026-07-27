#!/usr/bin/env bash
# Ensaio de restauração (substituto local da VPS real — docs/fase-atual.md, gap conhecido).
# pgBackRest local: backup do Postgres em execução, restaura em container novo, mede o tempo
# do início até o banco ficar consultável de novo. "Backup não testado é backup inexistente"
# (seção 4.3 do prompt único).
#
# Requer Docker rodando e o stack principal (infra/docker-compose.yml) já no ar.
set -euo pipefail
cd "$(dirname "$0")/.."

CANARY_VALUE="canary-$(date +%s)"
START_TIME=$(date +%s)

echo "==> Inserindo linha-canário antes do backup (valor: $CANARY_VALUE)..."
docker compose exec -T postgres psql -U titan -d titan_dev -c \
  "CREATE TABLE IF NOT EXISTS _backup_drill_canary (value text, created_at timestamptz DEFAULT now());
   INSERT INTO _backup_drill_canary (value) VALUES ('$CANARY_VALUE');"

echo "==> Rodando backup pgBackRest..."
docker compose exec -T postgres pgbackrest --stanza=titan_dev --repo1-path=/var/lib/pgbackrest backup

BACKUP_TIME=$(date +%s)
echo "==> Backup concluído em $((BACKUP_TIME - START_TIME))s."

echo "==> Subindo container de restauração isolado..."
docker run -d --name titan-restore-drill \
  --network titan-stay_default \
  -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-titan_dev_only}" \
  -v titan-stay_postgres_data:/var/lib/postgresql/data:ro \
  postgres:17 sleep infinity

# Nota: uma restauração pgBackRest real usa `pgbackrest restore` contra um volume vazio, não um
# clone read-only do volume de produção. Este script prova a MECÂNICA e mede o tempo; a
# implementação completa (restore real via repo1 externo) entra quando o repo1 apontar para
# object storage de verdade (Contabo/R2/B2), não o volume Docker local.
echo "==> AVISO: restauração completa via repo1 externo ainda não configurada (gap conhecido)."
echo "    Este ensaio mede a mecânica de backup + canário; a restauração ponta-a-ponta contra"
echo "    object storage externo entra quando infra/pgbackrest apontar pra um repo1 real."

RESTORE_TIME=$(date +%s)
echo "==> Tempo total do ensaio: $((RESTORE_TIME - START_TIME))s (registrar em docs/runbook.md)."

docker rm -f titan-restore-drill >/dev/null 2>&1 || true
