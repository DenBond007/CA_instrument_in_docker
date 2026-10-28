#!/usr/bin/env bash
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
mkdir -p backup
STAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE="backup/sa-analyst-config-${STAMP}.tar.gz"
LOCAL_CONFIG=()
if [[ -d .local/drawio ]]; then
  LOCAL_CONFIG+=(.local/drawio)
fi
tar -czf "$ARCHIVE" \
  --exclude=./backup \
  --exclude=./vendor/mermaid-live-editor \
  --exclude=./.obsidian/workspace.json \
  --exclude=./.git \
  compose.yaml compose.portainer.yaml compose.build.yaml compose.drawio-ai.yaml .env.example .env \
  scripts samples specs docker kubernetes tests assets .github package.json package-lock.json \
  playwright.config.mjs .dockerignore ./*.md "${LOCAL_CONFIG[@]}"
chmod 600 "$ARCHIVE"
echo "Создан архив конфигурации и файлов: $ARCHIVE"
echo 'ВАЖНО: данные Portainer и Next AI Draw.io в named volumes сюда НЕ включены.'
echo 'См. 10 - Эксплуатация, обновления и резервное копирование.md'
