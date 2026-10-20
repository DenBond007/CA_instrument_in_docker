#!/bin/sh
set -eu

: "${KROKI_URL:?Set KROKI_URL to the browser-accessible HTTP(S) URL of Kroki}"
runtime_dir=${MERMAID_HTML_DIR:-/usr/share/nginx/html}
kroki_url=${KROKI_URL%/}

# Reject non-HTTP URLs, user credentials, whitespace, queries and fragments.
if ! printf '%s' "$kroki_url" | jq -Rse \
  'test("^https?://[^/?#@\\s]+(/[^?#\\s]*)?$")' >/dev/null; then
  echo 'KROKI_URL must be an absolute HTTP(S) base URL without credentials, query or fragment.' >&2
  exit 1
fi

runtime_tmp=$(mktemp "$runtime_dir/.runtime-config.XXXXXX")
trap 'rm -f "$runtime_tmp"' EXIT HUP INT TERM
{
  printf 'window.__MERMAID_RUNTIME_CONFIG__ = '
  jq -cn --arg url "$kroki_url" '{krokiRendererUrl: $url}'
  printf ';\n'
} > "$runtime_tmp"
chmod 644 "$runtime_tmp"
mv "$runtime_tmp" "$runtime_dir/runtime-config.js"
