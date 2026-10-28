#!/usr/bin/env python3
"""Generate local draw.io settings and a fixed-upstream Nginx proxy."""

import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit


def generate(settings):
  enabled = settings.get("DRAWIO_AI_ENABLED", "true")
  if enabled not in ("true", "false"):
    raise ValueError("DRAWIO_AI_ENABLED должен быть true или false")
  enabled = enabled == "true"
  model = settings.get("DRAWIO_AI_MODEL", "")
  key = settings.get("DRAWIO_AI_API_KEY", "")
  base = settings.get("DRAWIO_AI_BASE_URL", "").rstrip("/")
  tokens = settings.get("DRAWIO_AI_MAX_TOKENS", "8192")
  config = {"enableAi": enabled, "aiActions": []}
  llm_location = "location = /llm/chat/completions { return 404; }"
  if enabled:
    if not model or len(model) > 256 or any(ord(c) < 32 for c in model):
      raise ValueError("Задайте DRAWIO_AI_MODEL или AI_DRAWIO_MODEL")
    if not re.fullmatch(r"[A-Za-z0-9._~+/=-]+", key):
      raise ValueError("Задайте корректный DRAWIO_AI_API_KEY или AI_DRAWIO_API_KEY")
    if not re.fullmatch(r"[0-9]{1,6}", tokens) or not 1 <= int(tokens) <= 131072:
      raise ValueError("DRAWIO_AI_MAX_TOKENS должен быть от 1 до 131072")
    # Only static, credential-free URLs are admitted into Nginx configuration.
    if not re.fullmatch(r"https?://[A-Za-z0-9.\[\]:-]+(?:/[A-Za-z0-9._~%/+-]*)?", base):
      raise ValueError("AI BASE_URL должен быть HTTP(S) URL без логина, query и fragment")
    parsed = urlsplit(base)
    if not parsed.hostname or parsed.username or parsed.password:
      raise ValueError("Некорректный AI BASE_URL")
    if parsed.port is not None and not 1 <= parsed.port <= 65535:
      raise ValueError("Некорректный порт AI BASE_URL")
    if parsed.path.endswith("/chat/completions"):
      raise ValueError("AI BASE_URL — базовый адрес, без /chat/completions")
    config.update({
      "aiActions": ["create", "update"],
      "gptApiKey": "local-proxy",
      "aiConfigs": {"gpt": {
        "apiKey": "gptApiKey",
        "endpoint": "/llm/chat/completions",
        # draw.io sets Content-Type itself; duplicating it breaks strict APIs.
        "requestHeaders": {},
        "request": {
          "model": "{model}",
          "messages": [
            {"role": "system", "content": "{action}"},
            {"role": "user", "content": "{prompt}"},
          ],
          "stream": False,
          "max_tokens": int(tokens),
        },
        "responsePath": "$.choices[0].message.content",
      }},
      "aiModels": [{"name": "LLM: " + model, "model": model, "config": "gpt"}],
    })
    llm_location = f"""location = /llm/chat/completions {{
    limit_except POST {{ deny all; }}
    proxy_pass {base}/chat/completions;
    proxy_http_version 1.1;
    proxy_ssl_server_name on;
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    proxy_set_header Host $proxy_host;
    proxy_set_header Authorization "Bearer {key}";
    proxy_set_header Content-Type "application/json";
    proxy_set_header Cookie "";
    proxy_set_header Origin "";
    proxy_set_header Referer "";
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;
    access_log off;
    error_log /dev/null crit;
  }}"""
  nginx = """# Generated locally. Contains an upstream credential; do not publish.
server {
  listen 8080;
  server_name _;
  server_tokens off;
  client_max_body_size 4m;
  add_header Cache-Control "no-store" always;
  add_header X-Content-Type-Options nosniff always;
  add_header Referrer-Policy no-referrer always;
  add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'" always;

  location = /health {
    access_log off;
    proxy_pass http://drawio:8080/;
  }

  location = /js/PostConfig.js {
    proxy_pass http://drawio:8080;
    proxy_set_header Host $http_host;
    proxy_set_header Connection "";
    proxy_set_header Accept-Encoding "";
    addition_types text/javascript application/javascript;
    add_after_body /drawio-ai-runtime.js;
  }

  location = /drawio-ai-runtime.js {
    internal;
    alias /etc/nginx/drawio-ai-runtime.js;
    default_type application/javascript;
  }

  __LLM_LOCATION__

  location ^~ /llm/ { return 404; }
  location = /proxy { return 404; }
  location / {
    proxy_pass http://drawio:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header Connection "";
  }
}
""".replace("__LLM_LOCATION__", llm_location)
  return json.dumps(config, ensure_ascii=False, indent=2) + "\n", nginx


def write_local(directory, files):
  for path in (directory.parent, directory):
    if path.is_symlink():
      raise ValueError("Каталог локальной конфигурации не должен быть ссылкой")
    path.mkdir(mode=0o700, exist_ok=True)
    if path.stat().st_uid != os.getuid():
      raise ValueError("Локальная конфигурация должна принадлежать текущему пользователю")
    path.chmod(0o700)
  for name in files:
    if (directory / name).is_symlink():
      raise ValueError("Файлы конфигурации не должны быть ссылками")
  for name, content in files.items():
    fd, temporary = tempfile.mkstemp(prefix=".prepare-", dir=directory)
    try:
      with os.fdopen(fd, "w") as stream:
        stream.write(content)
      # The private 0700 parent protects the host files. Containers mount each
      # file individually and must be able to read it as non-root users.
      os.chmod(temporary, 0o644)
      os.replace(temporary, directory / name)
    finally:
      Path(temporary).unlink(missing_ok=True)


def main():
  root = Path(__file__).resolve().parent.parent
  result = subprocess.run(
    ["docker", "compose", "config", "--format", "json", "drawio-gateway"],
    cwd=root, capture_output=True, text=True,
  )
  if result.returncode:
    raise ValueError("Не удалось прочитать Compose; проверьте .env через docker compose config --quiet")
  settings = json.loads(result.stdout)["services"]["drawio-gateway"]["environment"]
  public, private = generate(settings)
  write_local(root / ".local" / "drawio", {"drawio.json": public, "nginx.conf": private})
  print("Локальная конфигурация draw.io подготовлена в .local/drawio; ключ скрыт.")


if __name__ == "__main__":
  try:
    main()
  except (ValueError, OSError, KeyError) as error:
    # Configuration errors must never echo a secret value or Compose output.
    if isinstance(error, ValueError) and not isinstance(error, json.JSONDecodeError):
      print(str(error), file=sys.stderr)
    else:
      print("Не удалось подготовить локальную конфигурацию draw.io.", file=sys.stderr)
    sys.exit(1)
