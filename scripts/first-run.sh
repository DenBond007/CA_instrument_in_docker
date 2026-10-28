#!/usr/bin/env bash
# Использование: bash scripts/first-run.sh
set -euo pipefail
cd "$(dirname "$0")/.."

for cmd in docker curl ip python3; do
  command -v "$cmd" >/dev/null || { echo "Не найдена команда $cmd"; exit 1; }
done
sudo docker info >/dev/null || { echo 'Docker недоступен'; exit 1; }
sudo docker compose version >/dev/null || { echo 'Нужен docker compose plugin'; exit 1; }

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo 'Создан .env. ПРОВЕРЬТЕ BIND_IP и порты, затем запустите скрипт повторно.'
  echo 'Текущие адреса IPv4 Ubuntu:'
  ip -4 -brief address || true
  exit 0
fi

# Важно: перед сборкой проверяем BIND_IP и наличие .env.
BIND_IP=$(sed -n 's/^BIND_IP=//p' .env | head -1)
if [[ -z "$BIND_IP" ]] || ! ip -4 -o addr show | grep -Fq "inet ${BIND_IP}/"; then
  echo "IP ${BIND_IP:-<пусто>} не назначен ни одному интерфейсу сервера. Исправьте .env."
  ip -4 -brief address || true
  exit 1
fi

sudo docker compose config --quiet
python3 scripts/prepare-drawio-ai.py

echo 'Скачиваем готовые образы, включая портал и Mermaid из GHCR...'
echo 'Пакеты портала и Mermaid публичные: авторизация в GHCR для скачивания не требуется.'
PORTAL_IMAGE=$(sudo docker compose config --images portal)
if [[ $PORTAL_IMAGE == local/analyst-portal:dev ]]; then
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
# Generated bind-mounted files are replaced atomically; recreate to remount them.
sudo docker compose up -d --no-build --force-recreate drawio drawio-gateway
sudo docker compose up -d --no-build

echo
sudo docker compose ps
printf '\nПроверка HTTP и API: bash scripts/healthcheck.sh\n'
echo 'Portainer запускается отдельно: см. 02 - Установка и первый запуск.md'
printf 'Стартовая страница: http://%s\n' "$(sudo docker compose port portal 8080)"
