---
tags: [portainer, docker, gui, руководство]
---
# Portainer CE — краткая инструкция со скриншотами

> [!summary] Для кого
> Управление Docker через браузер, когда основной набор аналитика развёрнут через `docker compose`. **Время чтения 5–7 минут**.

**Адрес:** `https://192.168.88.42:9443` (если `.env` не изменялся). При первом запуске — создание пароля администратора; самоподписанный сертификат может вызвать предупреждение. Новые инсталляции иногда требуют setup token: посмотрите `sudo docker compose -f compose.portainer.yaml logs --tail=60 portainer`.

> [!important] Какие здесь изображения
> **Локальные PNG ниже — обучающие иллюстрации**, составленные специально для этой памятки, поэтому открываются **без интернета**. Названия кнопок ориентировочные: версия Portainer может отличаться. Под каждым разделом дана ссылка на **подлинный скриншот из официальной документации Portainer**, который Obsidian подгружает из интернета. Иллюстрации не являются скриншотами вашего сервера.

## 1. Выбрать локальный Docker

На **Home → Environments** нажмите карточку `local` (Docker Standalone).

![[assets/portainer/01-home.png]]

**Официальный скриншот:** ![Portainer Home, официальный скриншот](https://content.gitbook.com/content/MmwXfSb4bP3JyB8BLrAf/blobs/gt2ZhAqf7OMvzVrefT0d/2.41.1-home.png)

[Источник: Portainer Home](https://docs.portainer.io/user/home).

## 2. Запуск / остановка / перезапуск контейнера

Слева выберите **Containers**. Поставьте галочку напротив нужного контейнера и нажмите **Start**, **Stop**, **Restart**. Если нажать имя контейнера, откроются подробности.

![[assets/portainer/02-containers.png]]

**Официальный скриншот:** ![Portainer Containers, официальный скриншот](https://content.gitbook.com/content/MmwXfSb4bP3JyB8BLrAf/blobs/DABZ01BrAzfglOQb7nH0/2.20-containers-list.png)

[Источник: Portainer Containers](https://docs.portainer.io/user/docker/containers).

> [!warning] Важно для Compose
> Не редактируйте параметры контейнера непосредственно в Portainer как постоянную конфигурацию нашего набора. После пересоздания через `docker compose up -d` такие изменения могут исчезнуть. Правильное место правок — `compose.yaml` + `.env`.

## 3. Просмотр логов и статистики

Откройте контейнер, затем вкладку/кнопку **Logs** или **Stats**.

![[assets/portainer/03-details.png]]

**Logs:** удобно искать ошибки запуска, отказ API, отсутствие соединения с Kroki, ошибки рендера. Есть поиск, ограничение числа строк, автообновление и скачивание логов.

![[assets/portainer/04-logs.png]]

**Официальный скриншот логов:** ![Portainer Logs, официальный скриншот](https://content.gitbook.com/content/MmwXfSb4bP3JyB8BLrAf/blobs/CfDyzFJz9S99xqmX12hq/2.17-containers-logs-search.png)

[Источник: Portainer Logs](https://docs.portainer.io/user/docker/containers/logs).

**Stats:** CPU, RAM, сеть, процессы. Не перепутайте фоновые нагрузки с ошибкой — анализируйте вместе с логами.

![[assets/portainer/06-stats.png]]

**Официальный скриншот Stats:** ![Portainer Stats, официальный скриншот](https://content.gitbook.com/content/MmwXfSb4bP3JyB8BLrAf/blobs/fvfA8om8uw0ELABAWDjV/2.15-docker_containers_container_stats_usage.png)

[Источник: Portainer Stats](https://docs.portainer.io/user/docker/containers/stats).

## 4. Где смотреть весь Compose-проект

Слева выберите **Stacks**, найдите `sa-analyst-suite` — появится список связанных контейнеров и общий статус.

![[assets/portainer/05-stacks.png]]

**Официальный скриншот:** ![Portainer Stacks, официальный скриншот](https://content.gitbook.com/content/MmwXfSb4bP3JyB8BLrAf/blobs/kr0h0p2CGlKmLnEAwtGw/2.20-stacks-list.png)

[Источник: Portainer Stacks](https://docs.portainer.io/user/docker/stacks).

**Принцип:** этот комплект развёрнут **через CLI**, поэтому Portainer может показывать stack как **external/limited** и не позволять редактировать сам Compose. Это нормально. Редактирование — в `compose.yaml`, применение — `sudo docker compose up -d` в его каталоге.

### Если хотите всё редактировать в Portainer

Portainer умеет создавать собственные стеки через **Stacks → Add stack → Web editor / Git repository**, но **не загружайте** туда наш `compose.yaml` без адаптации: он использует **локальный build context Mermaid**, `.env` и локальные bind mounts. Иначе получится второй стек, конфликт портов или ошибка сборки. Рекомендованная схема **CLI-first, Portainer для наблюдения**.

[Официальная инструкция по Stacks](https://docs.portainer.io/user/docker/stacks/add).

## 5. Images / Volumes / Networks

| Раздел | Для чего | Что можно делать безопасно |
|---|---|---|
| **Images** | Скачанные Docker-образы | Посмотреть размер и версии; удалять только образы, которые точно не нужны. |
| **Volumes** | Постоянные данные Docker | Найти **`portainer_data`**, не удалять без резервной копии. |
| **Networks** | Изолированные виртуальные сети | Посмотреть сеть `sa-analyst-suite_default`. Не удалять работающие сети. |
| **Containers** | Запущенные экземпляры | Stop/Restart, Logs, Stats, Inspect, Console. |
| **Stacks** | Группы контейнеров | Смотреть состав и статус; редактор стека доступен не всегда. |

## 6. Консоль внутри контейнера

`Containers → <имя контейнера> → Console → Connect`. Командная оболочка `sh` может быть доступна, `bash` — не во всех образах. **Не меняйте внутри контейнера файлы, которые должны пережить его пересоздание**.

## 7. Частые операции и CLI-эквиваленты

| В Portainer | Эквивалент в Ubuntu (в каталоге набора) |
|---|---|
| Containers → Restart → kroki | `sudo docker compose restart kroki` |
| Container → Logs | `sudo docker compose logs -f --tail=100 kroki` |
| Stacks → состав проекта | `sudo docker compose ps` |
| Images → Pull | `sudo docker compose pull --ignore-buildable` |
| Контейнер остановлен | `sudo docker compose up -d kroki` |
| Отображение CPU/RAM | `sudo docker stats` |

**Отдельно:** изменение настройки на диске: `nano compose.yaml`, затем `sudo docker compose config --quiet && sudo docker compose up -d`.

## 8. Безопасность

- Portainer управляет Docker через `/var/run/docker.sock`: по уровню влияния это почти административный доступ к серверу.
- Используйте HTTPS `9443`, сильный пароль и доступ через доверенную LAN/VPN.
- Не публикуйте `9443` и порты редакторов в интернет. В нашем Compose **нет авторизации** для обычных редакторов.
- Не используйте **Prune** / **Remove volume** как универсальную «очистку места»: можно потерять данные.

См. [[11 - Конфиденциальность и безопасность]], [[10 - Эксплуатация, обновления и резервное копирование]].
