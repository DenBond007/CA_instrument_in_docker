#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -r .env ]] || { echo 'Сначала скопируйте .env.example в .env'; exit 1; }
# Считываем из доверенного локального .env (не загружайте сюда чужие файлы).
set -a
# shellcheck source=/dev/null
source .env
set +a

printf '%-20s %s\n' SERVICE HTTP
failed=0
for spec in "Portal:${PORTAL_PORT:-18080}" "Mermaid:${MERMAID_PORT:-18081}" "PlantUML:${PLANTUML_PORT:-18082}" "SwaggerEditor:${SWAGGER_EDITOR_PORT:-18083}" "SwaggerUI:${SWAGGER_UI_PORT:-18084}" "draw.io:${DRAWIO_PORT:-18085}" "AsyncAPI:${ASYNCAPI_PORT:-18086}" "Kroki:${KROKI_PORT:-18087}"; do
  label=${spec%%:*}; port=${spec##*:}
  http=$(curl -L -sS -o /dev/null -w '%{http_code}' --max-time 8 "http://${BIND_IP}:${port}/" 2>/dev/null) || http='000'
  printf '%-20s %s\n' "$label" "$http"
  if [[ "$http" == 000 || "$http" == 5* ]]; then failed=1; fi
done

tmp=$(mktemp --suffix=.svg)
trap 'rm -f "$tmp"' EXIT
kroki_url=${KROKI_URL:-http://${BIND_IP}:${KROKI_PORT:-18087}}
kroki_url=${kroki_url%/}
if curl -fsS --max-time 45 -H 'Content-Type: text/plain; charset=utf-8' \
    --data-binary @samples/sequence.mmd \
    "${kroki_url}/mermaid/svg" -o "$tmp" \
   && grep -qi '<svg' "$tmp"; then
  echo 'Kroki POST /mermaid/svg: OK'
else
  echo 'Kroki POST /mermaid/svg: ОШИБКА. Проверьте kroki и kroki-mermaid.'
  failed=1
fi
exit "$failed"
