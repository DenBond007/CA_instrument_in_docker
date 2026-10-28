#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -r .env ]] || { echo 'Нет .env'; exit 1; }
echo 'Создайте резервную копию данных ДО обновления: bash scripts/backup-config.sh'
read -rp 'Продолжить обновление? [y/N] ' answer
[[ "$answer" =~ ^[yY]$ ]] || exit 0
PORTAL_IMAGE=$(sudo docker compose config --images portal)
if [[ $PORTAL_IMAGE == local/analyst-portal:dev ]]; then
  # A local portal tag has no registry image; rebuild it from this checkout.
  SERVICES=$(sudo docker compose config --services)
  PULL_SERVICES=()
  while IFS= read -r SERVICE; do
    if [[ -n $SERVICE && $SERVICE != portal ]]; then
      PULL_SERVICES+=("$SERVICE")
    fi
  done <<< "$SERVICES"
  sudo docker compose pull "${PULL_SERVICES[@]}"
  sudo docker compose -f compose.yaml -f compose.build.yaml build portal
else
  sudo docker compose pull
fi
python3 scripts/prepare-drawio-ai.py
sudo docker compose up -d --no-build --force-recreate drawio drawio-gateway
sudo docker compose up -d --no-build
printf '\nВерсия Mermaid задаётся переменной MERMAID_IMAGE в .env.\n'
echo 'Версия стартовой страницы задаётся PORTAL_IMAGE в .env.'
echo 'Версия AI-редактора задаётся AI_DRAWIO_IMAGE; подключение LLM — AI_DRAWIO_BASE_URL/MODEL/API_KEY.'
echo 'Для перехода на новую версию измените тег MERMAID_IMAGE перед обновлением.'
echo 'После обновления проверьте: bash scripts/healthcheck.sh'
