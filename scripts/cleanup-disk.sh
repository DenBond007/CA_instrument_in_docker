#!/usr/bin/env bash
# Ubuntu: предварительный просмотр по умолчанию, очистка только с --apply.
set -euo pipefail

usage() {
  cat <<'EOF'
Использование: bash scripts/cleanup-disk.sh [--dry-run | --apply] [--autoremove]

  --dry-run     Показать план без изменений (режим по умолчанию).
  --apply       Показать план, запросить подтверждение и выполнить очистку.
  --autoremove  Включить удаление ненужных пакетов APT после показа симуляции.
  -h, --help    Показать справку.

Очищаются установщики APT, неиспользуемый кэш сборок локального Docker,
образы Docker без тегов, старые ревизии установленных Snap, неиспользуемые
окружения Flatpak и архивные журналы (14 дней / 200 МиБ).
Также проверяются кэши pip, uv, npm, временный кэш Trivy и остатки установки
окружения Codex старше 7 дней. Открытые файлы и символические ссылки пропускаются.

Сохранены: контейнеры, volumes, образы с тегами, файлы проектов, .env, резервные
копии, установленные версии Codex и рабочее окружение codex-primary-runtime.
Запускайте от своего пользователя; sudo будет запрошен при применении.
Удаление пакетов дополнительно подтверждается в APT по окончательному списку.
EOF
}

APPLY=0
DRY_RUN=0
AUTOREMOVE=0
EXECUTE=0
ERRORS=0
for ARG in "$@"; do
  case "$ARG" in
    --apply) APPLY=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --autoremove) AUTOREMOVE=1 ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Неизвестный параметр: %s\n' "$ARG" >&2; usage >&2; exit 2 ;;
  esac
done
if ((APPLY && DRY_RUN)); then
  printf 'Укажите только один режим: --dry-run или --apply.\n' >&2
  exit 2
fi

for CMD in getent id realpath readlink find stat du df awk findmnt timeout; do
  command -v "$CMD" >/dev/null || { printf 'Не найдена команда %s\n' "$CMD" >&2; exit 1; }
done

TARGET_USER=$(id -un)
if ((EUID == 0)) && [[ -n ${SUDO_USER:-} && ${SUDO_USER} != root ]]; then
  TARGET_USER=$SUDO_USER
fi
ACCOUNT=$(getent passwd "$TARGET_USER")
IFS=: read -r _ _ TARGET_UID _ _ TARGET_HOME _ <<< "$ACCOUNT"
[[ $TARGET_UID =~ ^[0-9]+$ && $TARGET_HOME == /* && $TARGET_HOME != / ]] || {
  printf 'Не удалось определить безопасный домашний каталог.\n' >&2
  exit 1
}
TARGET_HOME=$(realpath -e -- "$TARGET_HOME")
[[ $TARGET_HOME != / ]] || exit 1
ROOT_CMD=()
USER_CMD=()
if ((EUID != 0)); then
  ROOT_CMD=(sudo --)
elif ((TARGET_UID != 0)); then
  command -v runuser >/dev/null || { printf 'Не найдена команда runuser.\n' >&2; exit 1; }
  USER_CMD=(runuser -u "$TARGET_USER" --)
fi

run() {
  printf '  '
  printf '%q ' "$@"
  printf '\n'
  if ((EXECUTE)); then
    if "$@"; then
      :
    else
      printf 'Не удалось выполнить команду (код %s); продолжаю остальные шаги.\n' "$?" >&2
      ERRORS=$((ERRORS + 1))
    fi
  fi
}

has_mounted_paths() {
  local DIR=$1 MOUNTS MOUNT
  if ! MOUNTS=$(findmnt --kernel --raw --noheadings --output TARGET) || [[ -z $MOUNTS ]]; then
    return 2
  fi
  while IFS= read -r MOUNT; do
    # В --raw пробелы и другие специальные символы представлены как \xNN.
    MOUNT=$(printf '%b' "$MOUNT")
    if [[ $MOUNT == "$DIR" || $MOUNT == "$DIR/"* ]]; then
      return 0
    fi
  done <<< "$MOUNTS"
  return 1
}

clean_user_cache() {
  local DIR=$1 RESOLVED OPEN_FILES STATUS
  [[ -d $DIR && ! -L $DIR ]] || return 0
  RESOLVED=$(realpath -e -- "$DIR") || return 0
  if [[ $RESOLVED != "$DIR" || $(stat -c %u -- "$DIR") != "$TARGET_UID" ]]; then
    printf 'Пропуск ссылки или чужого каталога: %s\n' "$DIR"
    return 0
  fi
  if has_mounted_paths "$DIR"; then
    printf 'Пропуск каталога с точкой монтирования внутри или на нём: %s\n' "$DIR"
    return 0
  else
    STATUS=$?
    if ((STATUS != 1)); then
      printf 'Пропуск %s: не удалось проверить таблицу монтирования.\n' "$DIR" >&2
      ERRORS=$((ERRORS + 1))
      return 0
    fi
  fi
  du -sh -- "$DIR" 2>/dev/null || true
  if ((EXECUTE)); then
    if ! command -v lsof >/dev/null; then
      printf 'Пропуск %s: для проверки открытых файлов нужен lsof.\n' "$DIR" >&2
      ERRORS=$((ERRORS + 1))
      return 0
    fi
    if OPEN_FILES=$("${ROOT_CMD[@]}" timeout 20s lsof -nP -t +D "$DIR" 2>&1); then
      printf 'Пропуск занятого каталога: %s\n' "$DIR"
      return 0
    else
      STATUS=$?
      if ((STATUS != 1)) || [[ -n $OPEN_FILES ]]; then
        printf 'Пропуск %s: не удалось проверить открытые файлы.\n' "$DIR" >&2
        ERRORS=$((ERRORS + 1))
        return 0
      fi
    fi
  fi
  run "${USER_CMD[@]}" rm -rf --one-file-system --preserve-root=all -- "$DIR"
}

clean_snap_revisions() {
  local FILE STEM NAME REVISION CURRENT
  [[ -d /var/lib/snapd/snaps ]] || return 0
  # Текущая ревизия сверяется по /snap/<имя>/current без обращения к snapd.
  # snap remove дополнительно запрещает удаление текущей ревизии.
  for FILE in /var/lib/snapd/snaps/*.snap; do
    [[ -f $FILE && ! -L $FILE ]] || continue
    STEM=${FILE##*/}
    STEM=${STEM%.snap}
    NAME=${STEM%_*}
    REVISION=${STEM##*_}
    [[ $NAME =~ ^[a-z0-9][a-z0-9-]*$ && $REVISION =~ ^x?[0-9]+$ ]] || continue
    CURRENT=$(readlink -- "/snap/$NAME/current") || continue
    [[ $CURRENT =~ ^x?[0-9]+$ && $CURRENT != "$REVISION" ]] || continue
    run "${ROOT_CMD[@]}" snap remove "$NAME" "--revision=$REVISION"
  done
}

cleanup() {
  local DIR RECENT
  if command -v apt-get >/dev/null; then
    run "${ROOT_CMD[@]}" apt-get clean
    if ((AUTOREMOVE)); then
      run "${ROOT_CMD[@]}" apt-get autoremove --purge
    fi
  fi

  if command -v docker >/dev/null && [[ -S /var/run/docker.sock ]]; then
    # Явно выбран локальный сокет и стандартный builder, а не удалённый контекст.
    run "${ROOT_CMD[@]}" env -u DOCKER_HOST -u DOCKER_CONTEXT -u BUILDX_BUILDER \
      -u BUILDKIT_HOST -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
      docker --host unix:///var/run/docker.sock buildx prune --builder default --all --force
    run "${ROOT_CMD[@]}" env -u DOCKER_HOST -u DOCKER_CONTEXT \
      -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
      docker --host unix:///var/run/docker.sock image prune --force
  fi

  if command -v snap >/dev/null; then
    clean_snap_revisions
  fi
  if command -v flatpak >/dev/null; then
    run "${ROOT_CMD[@]}" flatpak uninstall --system --unused --assumeyes
    if ((TARGET_UID != 0)); then
      run "${USER_CMD[@]}" flatpak uninstall --user --unused --assumeyes
    fi
  fi
  if command -v journalctl >/dev/null; then
    run "${ROOT_CMD[@]}" journalctl --rotate --vacuum-time=14d --vacuum-size=200M
  fi

  if ((TARGET_UID == 0)); then
    printf 'Пользовательские кэши пропущены: запустите скрипт от своего пользователя.\n'
    return 0
  fi
  for DIR in "$TARGET_HOME/.cache/pip" "$TARGET_HOME/.cache/uv" "$TARGET_HOME/.npm/_cacache"; do
    clean_user_cache "$DIR"
  done
  clean_user_cache /tmp/sopds-release-sca/trivy/cache

  for DIR in "$TARGET_HOME"/.cache/codex-runtimes/codex-runtime-install-*; do
    [[ -d $DIR && ! -L $DIR ]] || continue
    if ! RECENT=$(find -P "$DIR" -xdev -mtime -7 -print -quit 2>/dev/null); then
      printf 'Пропуск недоступного каталога установки: %s\n' "$DIR"
      continue
    fi
    if [[ -n $RECENT ]]; then
      printf 'Пропуск установки с изменениями за последние 7 дней: %s\n' "$DIR"
      continue
    fi
    clean_user_cache "$DIR"
  done
}

printf 'Пользователь: %s; домашний каталог: %s\n' "$TARGET_USER" "$TARGET_HOME"
df -h /
if ((AUTOREMOVE)); then
  command -v apt-get >/dev/null || { printf 'APT не установлен.\n' >&2; exit 1; }
  printf '\nПредварительный список удаления пакетов APT:\n'
  apt-get --simulate autoremove --purge || {
    printf 'Симуляция APT завершилась ошибкой; очистка отменена.\n' >&2
    exit 1
  }
fi
printf '\nПлан очистки (пока без изменений):\n'
cleanup
if ((!APPLY)); then
  printf '\nИзменений нет. Для очистки повторите запуск с --apply.\n'
  printf 'Удаление пакетов APT включается отдельно параметром --autoremove.\n'
  if ((ERRORS)); then exit 1; fi
  exit 0
fi

printf '\nКэши придётся загрузить заново; архивные журналы будут удалены по указанным лимитам.\n'
if ! read -r -p 'Для выполнения плана введите yes: ' ANSWER || [[ $ANSWER != yes ]]; then
  printf 'Очистка отменена.\n'
  exit 0
fi
if ((EUID != 0)); then
  command -v sudo >/dev/null || { printf 'Не найдена команда sudo.\n' >&2; exit 1; }
  sudo -v
fi
FREE_BEFORE=$(df -B1 --output=avail / | awk 'NR == 2 {print $1}')
ERRORS=0
EXECUTE=1
printf '\nВыполняю очистку:\n'
cleanup
FREE_AFTER=$(df -B1 --output=avail / | awk 'NR == 2 {print $1}')
printf '\nИзменение доступного места на /: %s байт.\n' "$((FREE_AFTER - FREE_BEFORE))"
df -h /
if ((ERRORS)); then
  printf 'Очистка завершена с ошибками: %s. Проверьте сообщения выше.\n' "$ERRORS" >&2
  exit 1
fi
printf 'Очистка завершена.\n'
