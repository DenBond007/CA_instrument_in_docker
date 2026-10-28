#!/bin/sh
set -eu

# Only public navigation settings are serialized. Never expose the whole .env.
portal_host=${PORTAL_HOST:-${BIND_IP:-}}
runtime_file=${PORTAL_CONFIG_FILE:-/tmp/portal-runtime-config.js}
runtime_tmp=$(mktemp "${runtime_file}.XXXXXX")
trap 'rm -f "$runtime_tmp"' EXIT HUP INT TERM

printf 'window.__ANALYST_PORTAL_CONFIG__ = ' > "$runtime_tmp"
jq -cn --arg host "$portal_host" '
  def port($name; $value):
    if ($value | test("^[0-9]{1,5}\\z")) then
      ($value | tonumber) as $number |
      if $number >= 1 and $number <= 65535 then $number | tostring
      else error($name + " must be between 1 and 65535") end
    else error($name + " must be a numeric port") end;
  def base_url($name; $value):
    if ($value | test("^https?://([A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|\\[[0-9A-Fa-f:]+\\])(:[0-9]{1,5})?(/[^?#\\s]*)?\\z")) then
      ($value | capture("^https?://(?:\\[[0-9A-Fa-f:]+\\]|[^/:]+)(?::(?<port>[0-9]+))?")) as $parts |
      (if $parts.port != null then port($name; $parts.port) else "" end) |
      $value | sub("/+$"; "")
    else error($name + " must be an HTTP(S) base URL without credentials, query or fragment") end;

  if ($host | test("^([A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?|\\[[0-9A-Fa-f:]+\\])\\z")) then .
  else error("Set PORTAL_HOST or BIND_IP to a browser-accessible IP address or DNS hostname") end |
  (env.PORTAL_TITLE // "Инструменты аналитика") as $title |
  if ($title | length) >= 1 and ($title | length) <= 120 then .
  else error("PORTAL_TITLE must contain between 1 and 120 characters") end |
  (env.PORTAL_SHOW_PORTAINER // "true") as $show_portainer |
  if $show_portainer == "true" or $show_portainer == "false" then .
  else error("PORTAL_SHOW_PORTAINER must be true or false") end |
  (env.DRAWIO_AI_ENABLED // "true") as $drawio_ai |
  if $drawio_ai == "true" or $drawio_ai == "false" then .
  else error("DRAWIO_AI_ENABLED must be true or false") end |
  ("http://" + $host + ":") as $http |
  ($http + port("KROKI_PORT"; env.KROKI_PORT // "18087")) as $default_kroki |
  ("https://" + $host + ":" + port("PORTAINER_PORT"; env.PORTAINER_PORT // "9443")) as $default_portainer |
  {
    version: 1,
    title: $title,
    host: $host,
    tools: ({
      mermaid: ($http + port("MERMAID_PORT"; env.MERMAID_PORT // "18081")),
      plantuml: ($http + port("PLANTUML_PORT"; env.PLANTUML_PORT // "18082")),
      drawio: ($http + port("DRAWIO_PORT"; env.DRAWIO_PORT // "18085") + "/?offline=" + (if $drawio_ai == "true" then "0" else "1" end) + "&https=0&mode=device"),
      "ai-drawio": ($http + port("AI_DRAWIO_PORT"; env.AI_DRAWIO_PORT // "18088")),
      "swagger-editor": ($http + port("SWAGGER_EDITOR_PORT"; env.SWAGGER_EDITOR_PORT // "18083")),
      "swagger-ui": ($http + port("SWAGGER_UI_PORT"; env.SWAGGER_UI_PORT // "18084")),
      asyncapi: ($http + port("ASYNCAPI_PORT"; env.ASYNCAPI_PORT // "18086")),
      kroki: (base_url("KROKI_URL"; if (env.KROKI_URL // "") == "" then $default_kroki else env.KROKI_URL end))
    } + (if $show_portainer == "true" then {
      portainer: (base_url("PORTAINER_URL"; if (env.PORTAINER_URL // "") == "" then $default_portainer else env.PORTAINER_URL end))
    } else {} end))
  }
' >> "$runtime_tmp"
printf ';\n' >> "$runtime_tmp"
chmod 644 "$runtime_tmp"
mv "$runtime_tmp" "$runtime_file"
