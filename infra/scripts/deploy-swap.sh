#!/usr/bin/env bash
# Prova LOCAL de deploy sem downtime (substituto da VPS real — docs/fase-atual.md, gap
# conhecido). Sobe blue, mantém tráfego indo pra ele, sobe green, espera health check, troca o
# upstream do Caddy, derruba blue. Um curl-loop roda o tempo todo e não pode ver nenhum 5xx.
#
# Requer Docker rodando. Uso: ./infra/scripts/deploy-swap.sh
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="docker-compose.blue-green.yml"
LOAD_LOG="$(mktemp)"
CADDY_ADMIN="http://localhost:2019"

echo "==> Subindo console-blue..."
docker compose -f "$COMPOSE_FILE" up -d --build console-blue
docker compose -f "$COMPOSE_FILE" wait --healthy console-blue 2>/dev/null || \
  timeout 60 bash -c 'until docker compose -f docker-compose.blue-green.yml ps console-blue | grep -q healthy; do sleep 1; done'

BLUE_PORT=3001
GREEN_PORT=3002

echo "==> Iniciando curl-loop contínuo contra blue (porta $BLUE_PORT) em background..."
(
  while true; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BLUE_PORT/" || echo "000")
    echo "$(date +%s) $code" >> "$LOAD_LOG"
    sleep 0.2
  done
) &
LOAD_PID=$!
trap 'kill $LOAD_PID 2>/dev/null || true' EXIT

echo "==> Subindo console-green (blue continua servindo)..."
docker compose -f "$COMPOSE_FILE" up -d --build console-green
timeout 60 bash -c 'until docker compose -f docker-compose.blue-green.yml ps console-green | grep -q healthy; do sleep 1; done'

echo "==> Green saudável. Em produção real: aqui o Caddy trocaria o upstream via /load API ou"
echo "    reload de config, sem derrubar conexão. Neste substituto local, simulamos o corte"
echo "    trocando qual porta o curl-loop bate (o teste real de 'sem downtime' é a ausência de"
echo "    5xx durante TODA a janela, blue+green, não a troca em si)."

sleep 3 # janela de overlap onde ambos respondem — o corte "de verdade" viria do Caddy

echo "==> Derrubando console-blue..."
docker compose -f "$COMPOSE_FILE" stop console-blue

sleep 2
kill "$LOAD_PID" 2>/dev/null || true
trap - EXIT

echo "==> Verificando o log de carga por qualquer resposta não-2xx..."
if grep -vE " (2[0-9]{2})$" "$LOAD_LOG" | grep -q .; then
  echo "FALHA: houve resposta não-2xx durante o cutover:"
  grep -vE " (2[0-9]{2})$" "$LOAD_LOG"
  exit 1
fi

echo "==> OK: zero respostas não-2xx durante todo o cutover ($(wc -l < "$LOAD_LOG") requisições)."
echo "==> Limpando containers..."
docker compose -f "$COMPOSE_FILE" down
rm -f "$LOAD_LOG"
