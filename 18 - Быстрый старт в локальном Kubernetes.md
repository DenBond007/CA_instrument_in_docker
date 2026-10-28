---
tags: [kubernetes, quickstart, ubuntu, windows, macos]
---
# Быстрый старт в локальном Kubernetes

Локальный Kubernetes уже установлен, узлы работают, `kubectl` доступен в терминале. Этот путь подходит для Ubuntu, Windows и macOS, включая кластер Docker Desktop. Для запуска используются готовые образы и файлы `kubernetes/local/`; Docker CLI, Compose, Python и локальная сборка не нужны.

Вариант предназначен для личного ПК: отдельный namespace `sa-analyst-local`, внутренние Service типа ClusterIP и одна команда `port-forward` на **127.0.0.1**. Ingress, NodePort, LoadBalancer и Docker socket не используются.

## 1. Выбрать локальный кластер и скачать проект

| ОС | Терминал |
|---|---|
| Ubuntu | Bash |
| Windows | PowerShell; Git и kubectl должны быть доступны в PATH |
| macOS | Terminal |

Команды ниже записаны в одну строку и выполняются одинаково в этих терминалах. Нужны Git, kubectl и сеть для скачивания образов. Ориентир для контейнерной среды — 4 CPU и 8 ГиБ памяти без LLM.

```text
kubectl config get-contexts
kubectl config current-context
```

Проверьте, что выбран именно **локальный** кластер. Если нужен Kubernetes Docker Desktop, выберите его:

```text
kubectl config use-context docker-desktop
```

Для minikube/kind или другого локального Kubernetes выберите его фактическое имя из списка контекстов. Команды дальше создают ресурсы в выбранном кластере. Docker Desktop должен показывать запущенный Kubernetes; если он только установлен, создайте/включите кластер в разделе Kubernetes. На Linux kubectl может требовать отдельной установки — см. [документацию Docker Desktop Kubernetes](https://docs.docker.com/desktop/use-desktop/kubernetes/).

```text
kubectl cluster-info
kubectl get nodes
git clone https://github.com/DenBond007/CA_instrument_in_docker.git
cd CA_instrument_in_docker
```

Узлы должны иметь статус `Ready`. Если проект уже скачан, просто перейдите в его корень. Порты `18080`–`18088` должны быть свободны; остановите Compose-экземпляр этого набора, если он их занимает.

## 2. Создать конфигурацию и запустить

В корне проекта выполните по порядку; при ошибке сначала устраните её:

```text
kubectl apply -f kubernetes/local/namespace.yaml
kubectl -n sa-analyst-local create configmap analyst-openapi --from-file=openapi.yaml=specs/openapi.yaml --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f kubernetes/local/apps.yaml
kubectl apply -f kubernetes/local/gateway.yaml
kubectl -n sa-analyst-local wait --for=condition=Available deployment --all --timeout=300s
kubectl -n sa-analyst-local get pods,svc
```

Первая загрузка образов может занять больше пяти минут. При тайм-ауте смотрите диагностику ниже и повторите `wait`. Ожидается 12 доступных Deployment, включая gateway; Kroki Mermaid/BPMN работают как внутренние сервисы.

OpenAPI копируется в ConfigMap из **вашего** `specs/openapi.yaml`, без hostPath и зависимости от устройства файловой системы Windows/macOS. Параметры `.env` здесь **не читаются**. Адрес локального Kroki уже задан Mermaid при запуске; PlantUML использует SANDBOX, Kroki — SECURE, внешний валидатор и Try it out Swagger UI отключены.

В этом варианте обычный draw.io запускается **без AI-прокси**, с `enableAi=false`. Next AI Draw.io доступен отдельно, но сервер модели и ключ не настроены. Используется опубликованный портал `1.0.0`: карточки Next AI Draw.io в нём ещё нет, открывайте `18088` напрямую. Настройка AI через Compose описана в [[17 - Быстрый старт на локальном ПК]]; перенос `.env`, секретов и прокси в Kubernetes этим локальным примером не выполняется.

## 3. Открыть порты одной командой

Оставьте следующий процесс работающим в отдельном терминале:

```text
kubectl -n sa-analyst-local port-forward --address 127.0.0.1 service/local-gateway 18080:18080 18081:18081 18082:18082 18083:18083 18084:18084 18085:18085 18086:18086 18087:18087 18088:18088
```

Откройте **[портал](http://127.0.0.1:18080)**. Прямые адреса инструментов совпадают с таблицей в [[17 - Быстрый старт на локальном ПК]]: Mermaid `18081`, PlantUML `18082`, Swagger Editor `18083`, Swagger UI `18084`, draw.io `18085`, AsyncAPI `18086`, Kroki `18087`, Next AI Draw.io `18088`.

Команда направляет все порты в один Nginx gateway, который обращается к соответствующим Service внутри namespace. `127.0.0.1` в настройках Mermaid — адрес **браузера на ПК**, а не способ обращения между Pod. DNS-имена `kroki`, `drawio` и другие используются только внутри кластера.

При `Ctrl+C` или закрытии терминала доступ с ПК прекращается, приложения остаются запущенными. При пересоздании Pod gateway запустите `port-forward` повторно. Такое поведение и синтаксис нескольких портов описаны в [справке kubectl port-forward](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_port-forward/).

## 4. Проверить рендер

Во втором терминале, в корне проекта, для Ubuntu/macOS:

```bash
curl -fsS --max-time 45 -H 'Content-Type: text/plain; charset=utf-8' --data-binary @samples/sequence.mmd http://127.0.0.1:18087/mermaid/svg -o /tmp/analyst-kroki-check.svg
grep -q '<svg' /tmp/analyst-kroki-check.svg && echo 'Kroki: SVG получен'
```

Для Windows PowerShell используется именно `curl.exe`, чтобы не вызвать alias PowerShell:

```powershell
curl.exe -fsS --max-time 45 -H "Content-Type: text/plain; charset=utf-8" --data-binary "@samples/sequence.mmd" http://127.0.0.1:18087/mermaid/svg -o "$env:TEMP\analyst-kroki-check.svg"
Select-String -Path "$env:TEMP\analyst-kroki-check.svg" -Pattern '<svg' -Quiet
```

Ожидается SVG / `True`. Откройте редакторы, создайте схему и сохраните исходник на ПК. HTTP и readiness не проверяют генерацию через LLM.

## Изменение OpenAPI, остановка и данные

После правки `specs/openapi.yaml` повторите команду создания ConfigMap из шага 2, затем:

```text
kubectl -n sa-analyst-local rollout restart deployment/swagger-ui
kubectl -n sa-analyst-local rollout status deployment/swagger-ui --timeout=120s
```

Исходная спецификация остаётся в репозитории. `.drawio`, `.mmd`, `.puml` и YAML сохраняйте на ПК. Временные каталоги и `/app/data` Next AI Draw.io используют **emptyDir**, поэтому серверные настройки этого редактора теряются при замене Pod. Это учебный локальный запуск без постоянного хранилища; сохранение схем через экспорт обязательно.

Для временной остановки всех приложений только этого namespace:

```text
kubectl -n sa-analyst-local scale deployment --all --replicas=0
```

Для повторного запуска:

```text
kubectl -n sa-analyst-local scale deployment --all --replicas=1
kubectl -n sa-analyst-local wait --for=condition=Available deployment --all --timeout=300s
```

Затем запустите `port-forward` снова. Полное удаление локального набора, включая его ConfigMap и временные данные, выполняется командой `kubectl delete namespace sa-analyst-local`. Перед ней проверьте текущий контекст и экспортируйте нужные файлы. Portainer не входит в этот Kubernetes-пример.

## Диагностика

```text
kubectl -n sa-analyst-local get pods
kubectl -n sa-analyst-local get events --sort-by=.metadata.creationTimestamp
kubectl -n sa-analyst-local logs deployment/kroki --tail=100
kubectl -n sa-analyst-local logs deployment/local-gateway --tail=100
```

| Ошибка | Что проверить |
|---|---|
| `connection refused` к API Kubernetes | Кластер запущен, выбран правильный kube-context |
| `ImagePullBackOff` | Доступ узлов к Docker Hub/GHCR/`docker.swagger.io`, proxy и архитектуру образа |
| `Pending` | События Pod, свободные CPU/память и состояние узлов |
| `configmap analyst-openapi not found` | Команда ConfigMap из шага 2 выполнена до запуска Swagger UI |
| Gateway возвращает 502 | Готовность целевого Deployment, его логи и Service; свежие образы Java могут долго прогреваться |
| `address already in use` | Порты заняты Compose или другим `port-forward` |
| Ссылки портала не открываются | Работает ли процесс проброса **всех** портов, браузер запущен на том же ПК |
| ARM64: нет подходящего manifest / `exec format error` | Сторонний образ не поддерживает архитектуру узла; нужен совместимый тег либо локальный кластер на AMD64. Сам Kubernetes CPU не эмулирует |

Манифесты не настраивают публичный доступ и не заменяют конфигурацию кластера для командной эксплуатации. Границы фактической проверки — [[14 - Источники и ограничения]].

Источники команд: [ConfigMap из файла](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_configmap/), [kubectl apply](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_apply/).
