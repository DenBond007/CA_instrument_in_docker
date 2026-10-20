---
tags: [mermaid, kroki, runtime, ghcr, конфиденциальность]
---
# Mermaid Live Editor + локальный Kroki

## Как устроен кастомный образ

Используется `ghcr.io/denbond007/mermaid-live-editor-runtime:1.0.0`, собираемый GitHub Actions из закреплённого upstream-коммита Mermaid. Поддерживаются Linux AMD64 и ARM64. Dockerfile и небольшая проверяемая модификация исходников находятся в `docker/mermaid/`.

В отличие от официального образа, наш образ принимает **`KROKI_URL` при запуске**. Скрипт `/docker-entrypoint.d/40-runtime-config.sh` создаёт `/usr/share/nginx/html/runtime-config.js`, а браузер загружает настройки до модулей редактора. Nginx отдаёт этот файл с `Cache-Control: no-store`. Пустой или некорректный URL останавливает запуск: перехода на публичный Kroki по умолчанию нет.

Предпросмотр по-прежнему выполняется JavaScript-движком в браузере. Действие **Kroki** использует адрес из runtime-настроек. Публичные ссылки mermaid.ink, аналитика и продвижение Mermaid Chart отключены при сборке. Локальный экспорт SVG/PNG остаётся доступным. Это не гарантирует отсутствия остальных внешних запросов: см. [[11 - Конфиденциальность и безопасность]].

## Запуск из GHCR

Репозиторий: https://github.com/DenBond007/CA_instrument_in_docker

Пакет: https://github.com/users/DenBond007/packages/container/package/mermaid-live-editor-runtime

Для закрытого пакета выполните `sudo docker login ghcr.io -u YOUR_GITHUB_LOGIN`. В запрос пароля введите GitHub personal access token **classic** с `read:packages`; учётная запись должна иметь доступ к пакету. Не сохраняйте токен в Compose, `.env` проекта или Git. Авторизация через `sudo` нужна потому, что скрипты также запускают Docker через `sudo`. Публичному пакету авторизация для скачивания не требуется.

```bash
cp -n .env.example .env
nano .env
bash scripts/first-run.sh
```

Сотрудникам, работающим через браузер на одном сервере, доступ к GHCR не нужен.

## Настройки Compose

Фрагмент сервиса из `compose.yaml`:

```yaml
mermaid-editor:
  image: ${MERMAID_IMAGE:-ghcr.io/denbond007/mermaid-live-editor-runtime:1.0.0}
  environment:
    KROKI_URL: "${KROKI_URL:-http://${BIND_IP:?Set BIND_IP in .env}:${KROKI_PORT:-18087}}"
  ports:
    - "${BIND_IP}:${MERMAID_PORT:-18081}:8080"
```

В `.env` задайте LAN IPv4 интерфейса сервера:

```dotenv
BIND_IP=192.168.88.42
KROKI_PORT=18087
MERMAID_IMAGE=ghcr.io/denbond007/mermaid-live-editor-runtime:1.0.0
```

Compose подставит `http://192.168.88.42:18087`. `${BIND_IP}` **не определяет IP автоматически**: значение читается из `.env` или окружения. `first-run.sh` проверяет, что адрес назначен интерфейсу Ubuntu.

Для отдельного DNS-имени или HTTPS задайте полный URL:

```dotenv
KROKI_URL=https://kroki.example.internal
```

Допустим HTTP(S) URL с портом и префиксом пути. Адрес не должен содержать учётные данные, пробелы, query или fragment. Он виден пользователям в браузере и не предназначен для секретов.

**Почему не `http://kroki:8000` и не `localhost`?** Ссылка открывается в браузере сотрудника. Имя `kroki` разрешается внутри Docker-сети; `localhost` в браузере указывает на компьютер сотрудника. Используйте доступный сотрудникам IP или DNS. `BIND_IP=0.0.0.0` также не является адресом назначения для браузера.

## Изменение адреса без пересборки

```bash
nano .env
sudo docker compose up -d --no-build mermaid-editor
```

Образ остаётся прежним. Обновите страницу браузера. Для применения изменённых переменных нужен `up -d`, который пересоздаст контейнер; простой `restart` не перечитывает окружение из Compose.

Проверка файла настроек:

```bash
curl -i http://192.168.88.42:18081/runtime-config.js
bash scripts/healthcheck.sh
```

Откройте редактор, загрузите `samples/sequence.mmd` и найдите действие **Kroki**. Его ссылка должна начинаться с вашего URL. Через DevTools → Network проверьте получение `runtime-config.js` и отсутствие вызовов `kroki.io` и `mermaid.ink` при этом действии.

## Сборка и публикация новой версии

Workflow `.github/workflows/publish-mermaid.yml` запускается вручную, при теге `v*` и для проверок pull request. Публикация выполняется только после тестов, сборки и браузерной проверки одного образа с двумя адресами Kroki.

```bash
gh workflow run publish-mermaid.yml --ref main -f version=1.0.1
```

GitHub Actions использует `GITHUB_TOKEN` с `packages: write`. IP сервера в workflow не передаётся. Пакет связывается с репозиторием меткой `org.opencontainers.image.source`. Сохраняется кэш сборки; публикуются тег версии, SHA коммита и `latest` для стабильных версий.

Для обновления upstream измените полный `MERMAID_COMMIT` в `docker/mermaid/Dockerfile`, проверьте модификацию и выпустите новую версию. Скрипт модификации завершится ошибкой, если ожидаемый участок upstream изменился.

## Локальная разработка

```bash
sudo docker compose -f compose.yaml -f compose.build.yaml build mermaid-editor
sudo docker compose -f compose.yaml -f compose.build.yaml up -d --no-build mermaid-editor
npm ci
npm test
npx playwright install chromium
npm run test:browser
```

Локальный образ называется `local/mermaid-live-editor-runtime:dev`. `compose.build.yaml` нужен только для разработки. Браузерные тесты запускают временные контейнеры, проверяют рендер диаграммы, реальную Kroki-ссылку для двух URL и запрет кэширования настроек; контейнеры удаляются после проверки. Перед `npm test` на машине должен быть установлен `jq`.

Официальные источники: https://github.com/mermaid-js/mermaid-live-editor ; https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry
