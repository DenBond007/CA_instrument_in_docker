#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -r .env ]] || { echo 'Нет .env'; exit 1; }
echo 'Создайте резервную копию данных ДО обновления: bash scripts/backup-config.sh'
read -rp 'Продолжить обновление? [y/N] ' answer
[[ "$answer" =~ ^[yY]$ ]] || exit 0
sudo docker compose pull
sudo docker compose up -d --no-build
printf '\nВерсия Mermaid задаётся переменной MERMAID_IMAGE в .env.\n'
echo 'Версия стартовой страницы задаётся PORTAL_IMAGE в .env.'
echo 'Для перехода на новую версию измените тег MERMAID_IMAGE перед обновлением.'
echo 'После обновления проверьте: bash scripts/healthcheck.sh'
