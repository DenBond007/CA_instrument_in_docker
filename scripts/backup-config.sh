#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p backup
STAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE="backup/sa-analyst-config-${STAMP}.tar.gz"
tar -czf "$ARCHIVE" \
  --exclude=./backup \
  --exclude=./vendor/mermaid-live-editor \
  --exclude=./.obsidian/workspace.json \
  --exclude=./.git \
  compose.yaml compose.portainer.yaml compose.build.yaml .env.example .env \
  scripts samples specs docker tests assets .github package.json package-lock.json \
  playwright.config.mjs .dockerignore ./*.md
chmod 600 "$ARCHIVE"
echo "Создан архив конфигурации и файлов: $ARCHIVE"
echo 'ВАЖНО: данные Portainer в named volume portainer_data сюда НЕ включены.'
echo 'См. 10 - Эксплуатация, обновления и резервное копирование.md'
