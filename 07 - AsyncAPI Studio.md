---
tags: [asyncapi, kafka, события, интеграции]
---
# AsyncAPI Studio

**Назначение:** описание событийных API, брокеров, channels, messages, операций публикации/чтения, в том числе Kafka. Адрес `http://192.168.88.42:18086`.

## Запуск

```yaml
asyncapi:
  image: asyncapi/studio:latest
  ports:
    - "${BIND_IP}:${ASYNCAPI_PORT:-18086}:80"
```

Интерфейс редактора загружается из локального Docker-контейнера. Docker-образ `asyncapi/studio` официально публикуется и слушает **порт 80**. Демо-пример не требует брокера Kafka.

## Как использовать

1. Откройте AsyncAPI Studio в браузере.
2. Импортируйте/вставьте `samples/asyncapi.yaml`.
3. Проверьте `servers`, `channels`, `operations`, `messages`, JSON Schema payload.
4. Сохраните YAML **на диск** и в Git/Obsidian. Не считайте, что черновик в браузере — надёжное хранилище.
5. Для изменений в Kafka отдельно согласуйте `topic`, key, partitioning, headers, delivery semantics, версионирование сообщений и обработку ошибок.

### Пример содержимого `samples/asyncapi.yaml`

```yaml
asyncapi: 3.0.0
info:
  title: Orders Events
  version: 1.0.0
channels:
  orderEvents:
    address: orders.events
operations:
  publishOrderCreated:
    action: send
    channel:
      $ref: '#/channels/orderEvents'
```

Полный файл примера с определением сообщения лежит в каталоге `samples/`.

## Работа с Kroki

Прямое назначение внешнего Kroki как движка AsyncAPI Studio не предусмотрено в этом комплекте. Диаграммы процесса/событий можно **отдельно** сформировать через Kroki и включить в внешнюю документацию Markdown/Obsidian как SVG. Встроенное отображение схем Studio само по себе не означает вызов Kroki.

> [!note] Стабильность API
> AsyncAPI Studio может меняться до устойчивого релиза. На production закрепляйте конкретный Docker tag/digest и проверяйте обратную совместимость редактора.

Источник: https://github.com/asyncapi/studio/blob/master/apps/studio/README.md
