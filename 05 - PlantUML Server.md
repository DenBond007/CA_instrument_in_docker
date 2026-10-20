---
tags: [plantuml, uml, kroki]
---
# PlantUML Server

**Назначение:** UML sequence/activity/class/deployment диаграммы из текстового PlantUML. Адрес по умолчанию: `http://192.168.88.42:18082`.

## В Docker

```yaml
plantuml:
  image: plantuml/plantuml-server:jetty
  restart: unless-stopped
  environment:
    PLANTUML_SECURITY_PROFILE: SANDBOX
  ports:
    - "${BIND_IP}:18082:8080"
```

`SANDBOX` запрещает обращения PlantUML к локальным файлам/внешним URL при генерации. Не отключайте этот профиль без отдельного анализа угроз.

## Как пользоваться

1. Откройте адрес сервера в браузере.
2. Вставьте пример из `samples/sequence.puml`.
3. Нажмите кнопку отображения/обновления рисунка (подписи зависят от версии интерфейса).
4. Сохраните **исходный `.puml`**, а изображение экспортируйте в SVG/PNG.

## Отличие от Kroki

| Вариант | Куда обращаться | Для чего |
|---|---|---|
| Отдельный PlantUML Server | `http://192.168.88.42:18082` | Интерактивная веб-страница и ссылки PlantUML. |
| PlantUML через Kroki | POST `http://192.168.88.42:18087/plantuml/svg` | Унифицированный API для скриптов и CI/CD. |

В Kroki уже есть PlantUML, поэтому **для автоматической генерации второй сервер не обязателен**. Но оставляем оба инструмента, поскольку по задаче нужны оба редактора/веб-варианта.

> [!important] Включение внешних библиотек
> При `SANDBOX` обычные `!includeurl https://...` не пройдут. Храните шаблоны локально и пересмотрите модель безопасности, если захотите разрешить специфичные ресурсы.

Документация: https://github.com/plantuml/plantuml-server и https://plantuml.com/security
