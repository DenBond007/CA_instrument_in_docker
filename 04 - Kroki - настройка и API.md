---
tags: [kroki, api, mermaid, plantuml, bpmn]
---
# Kroki — настройка и HTTP API

**Kroki** — единый API: принимает текст диаграммы, возвращает SVG/PNG и другие поддерживаемые форматы. Не является полнофункциональным визуальным редактором.

## Контейнеры

| Сервис | Обязателен | Роль |
|---|---|---|
| `kroki` | Да | Gateway и встроенные движки PlantUML, Graphviz, D2, Structurizr и др. |
| `kroki-mermaid` | Да для Mermaid | Подключается по Docker DNS `kroki-mermaid:8002`. |
| `kroki-bpmn` | Да для BPMN через Kroki | Подключается по `kroki-bpmn:8003`. |
| `kroki-excalidraw` | Нет | Через `docker compose --profile extras up -d`. |

Внутренние companion-порты не публикуются в LAN — с ними общается Kroki по сети Docker.

## Режим безопасности

В нашем Compose указано:

```yaml
environment:
  KROKI_SAFE_MODE: SECURE
  KROKI_MERMAID_HOST: kroki-mermaid
  KROKI_BPMN_HOST: kroki-bpmn
```

`SECURE` — режим Kroki по умолчанию; для встроенного PlantUML он соответствует профилю `SANDBOX`. Попытки подключать файлы и URL через `!include` / `!includeurl` ограничены. Не устанавливайте `KROKI_SAFE_MODE=UNSAFE` для недоверенных пользователей.

## API: преобразование Mermaid → SVG

В корне архива:

```bash
curl --fail --show-error --silent \
  -H 'Content-Type: text/plain; charset=utf-8' \
  --data-binary @samples/sequence.mmd \
  http://192.168.88.42:18087/mermaid/svg \
  -o /tmp/diagram-mermaid.svg
```

**POST**, а не GET с текстом в URL, удобен для больших диаграмм: меньше риск URI 414, исходный текст не попадает в параметры строки запроса. Сервер по-прежнему видит данные; на HTTP внутри LAN транспорт **не шифруется**.

## API: PlantUML → SVG

```bash
curl -fsS -H 'Content-Type: text/plain; charset=utf-8' \
  --data-binary @samples/sequence.puml \
  http://192.168.88.42:18087/plantuml/svg \
  -o /tmp/diagram-plantuml.svg
```

## API: Graphviz → SVG

```bash
printf 'digraph G { BA -> SA; SA -> ARCH; }' | \
  curl -fsS -H 'Content-Type: text/plain' --data-binary @- \
  http://192.168.88.42:18087/graphviz/svg \
  -o /tmp/diagram-graphviz.svg
```

## Проверка

```bash
sudo docker compose logs --tail=60 kroki kroki-mermaid kroki-bpmn
curl -fsS http://192.168.88.42:18087/health
bash scripts/healthcheck.sh
```

У разных версий состав сведений `/health` меняется. Успешный `/health` **не заменяет** тест конкретного движка через POST.

## Практические особенности

- SVG удобно хранить рядом с Markdown, а исходники `.mmd` / `.puml` — под контролем версий.
- У Kroki есть URL-форма (GET) и API-форма (POST). Если диаграмма чувствительная, не пересылайте публичные GET-ссылки и следите за журналированием URL.
- Если включите TLS/реверс-прокси для редактора, **адрес Kroki в браузере тоже должен быть HTTPS**. Иначе Chrome может блокировать смешанное содержимое HTTP.
- Отдельный PlantUML Server остаётся полезным как веб-интерфейс. Kroki — альтернативный программный API, см. [[05 - PlantUML Server]].

Документация: https://docs.kroki.io/kroki/setup/install/ и https://docs.kroki.io/kroki/setup/configuration/
