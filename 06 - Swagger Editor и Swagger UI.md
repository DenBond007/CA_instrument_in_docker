---
tags: [openapi, swagger, api, system-analysis]
---
# Swagger Editor и Swagger UI

**Swagger Editor** (`:18083`) — подготовка и проверка OpenAPI в интерфейсе. **Swagger UI** (`:18084`) — публикация читаемой документации к уже сохранённому контракту.

## Разница (важно)

| | Swagger Editor | Swagger UI |
|---|---|---|
| Создание/редактирование | Да | Нет, просмотр |
| Валидация схемы | Встроенные проверки Editor | По умолчанию подключён внешний validator, **у нас отключён** |
| Откуда берёт контракт | Из редактора/импорта пользователя | Из файла `specs/openapi.yaml` |
| Сохранение в наш каталог | **Экспортировать вручную** | Читает bind mount `/specs` |
| Риск выполнения HTTP к API | Не для описания API | `Try it out` у нас **отключён** |

## Как работать

1. Откройте Swagger Editor `http://192.168.88.42:18083`.
2. Создайте OpenAPI 3.x контракт либо импортируйте свой YAML/JSON.
3. Исправьте ошибки, экспортируйте YAML на компьютер.
4. Замените на сервере файл `specs/openapi.yaml` (например, через SSH/SCP/Git).
5. Для надёжного подхвата новой спецификации перезапустите Swagger UI:

```bash
sudo docker compose restart swagger-ui
```

6. Откройте `http://192.168.88.42:18084` и проверьте заголовок, endpoints и схемы.

## Фрагмент Compose

```yaml
swagger-ui:
  image: docker.swagger.io/swaggerapi/swagger-ui:latest
  environment:
    SWAGGER_JSON: /specs/openapi.yaml
    VALIDATOR_URL: none
    SUPPORTED_SUBMIT_METHODS: "[]"
  volumes:
    - ./specs:/specs:ro
  ports:
    - "${BIND_IP}:${SWAGGER_UI_PORT:-18084}:8080"
```

- `VALIDATOR_URL: none` отключает внешний `validator.swagger.io`.
- `SUPPORTED_SUBMIT_METHODS: "[]"` отключает кнопки **Try it out** для всех HTTP-методов (не является изоляцией от сети).
- `ro` исключает запись в bind mount из контейнера.

> [!warning] API-сервисы в `servers:`
> Контракт может указывать реальные endpoint-адреса. Не нажимайте Try it out, если оно когда-либо будет включено, на production API без разрешения. При работе через браузер требуются CORS и соответствующий TLS. Открытый в LAN Swagger UI не заменяет gateway и авторизацию API.

## Kroki и Swagger

**Прямой интеграции рендерера нет.** В `description` операции можно использовать Markdown с `![Диаграмма](http://192.168.88.42:18087/...)` на уже созданное изображение; возможность загрузки и отображения зависит от URI, браузерной политики и CSP. Практичнее **сохранить SVG отдельно** и публиковать его своим файловым сервером при необходимости.

## Пример

Файл `specs/openapi.yaml` содержит демонстрационный GET `/health`; URL сервера в нём условный, реальный API этим архивом не создаётся.

Источники: https://swagger.io/docs/open-source-tools/swagger-editor/ и https://swagger.io/docs/open-source-tools/swagger-ui/usage/configuration/
