# Релиз и CI

## CI (`.github/workflows/ci.yml`)
На каждый push в `main` и каждый pull request прогоняется гейт на Ubuntu (как прод):
`typecheck → lint → vitest → build`, с сервис-контейнером PostgreSQL и применением миграций.
Playwright e2e в CI намеренно не входит (нужен поднятый сервер + сид + браузеры) — гоняется локально: `pnpm test:e2e`.

Отдельный job **`release-bundle`** собирает бандл самообновления и **проверяет его end-to-end**:
распаковывает, прогоняет `prisma migrate deploy` из бандла, поднимает `next start`, дёргает
`/api/health`. Это единственное место, где доказывается работоспособность бандла (на Windows-dev
её не проверить), поэтому сломанный бандл валит CI здесь, а не у пользователя.

## Выпуск релиза (`.github/workflows/release.yml`)
Релиз создаётся пушем semver-тега:

```bash
# 1) поднять версию в web/package.json (например, 0.1.0 → 0.2.0), закоммитить
# 2) поставить тег и запушить его
git tag v0.2.0
git push origin v0.2.0
```

По тегу `v*` workflow:
1. собирает и пушит Docker-образы в **GHCR**:
   - `ghcr.io/<owner>/aapanel-manager:<version>` и `:latest` (приложение, стадия `runner`);
   - `ghcr.io/<owner>/aapanel-manager-worker:<version>` и `:latest` (миграции + опциональный выделенный поллер, стадия `worker`);
   - в образ прокидываются `APP_VERSION` (из тега) и `APP_COMMIT` (SHA) → их показывает `getCurrentVersion()`;
2. собирает **бандл самообновления** `aapanel-manager-bundle-<version>.tar.gz` + `.sha256`, **прогоняет smoke** (миграции + `next start` + `/api/health`) и прикладывает оба файла к релизу — их скачивает встроенное самообновление (режим aaPanel, Фаза 2);
3. создаёт **GitHub Release** с авто-заметками. Именно его читает встроенная проверка обновлений (`/settings` → «доступно обновление»).

## Как пользователь обновляется (режим docker)
`docker-compose.yml` должен ссылаться на опубликованный образ вместо `build:`:

```yaml
services:
  app:
    image: ghcr.io/<owner>/aapanel-manager:0.2.0   # или :latest
```

Приложение опрашивает панели **внутри процесса `app`** (advisory-lock защищает от
двойного опроса при нескольких репликах) — отдельный сервис `worker` не нужен.
Образ `aapanel-manager-worker` остаётся для one-shot `migrate` и для опционального
выделенного поллера, если опрос захочется вынести с веб-сервера.

Обновление: `docker compose pull && docker compose up -d` (сервис `migrate` прогонит миграции).

## Версионирование
- `web/package.json` `version` — источник версии по умолчанию (fallback для `getCurrentVersion()`).
- Тег релиза `vX.Y.Z` должен соответствовать этой версии; `APP_VERSION` из тега перекрывает её в образе.

## Самообновление (Версии Фаза 2)
Сделано:
- **Бандл релиза** `aapanel-manager-bundle-<v>.tar.gz` + `.sha256` как ассет (Фаза 2a), с самопроверкой в CI.
- **Серверная «начинка» (2a+2b)**: скачивание, **проверка sha256**, атомарная распаковка, бэкап БД, миграции, **активация** (своп симлинка `current` + рестарт своего Node-проекта через aaPanel API) и **откат** — `web/src/lib/deploy/`; действия `stageUpdateAction`/`activateUpdateAction`/`rollbackUpdateAction`; `/api/health`.

Осталось (Фаза 2b — финал):
- **UI-кнопки** «Подготовить → Применить» / «Откатить» в админке (подтверждения + поллинг `/api/health` после рестарта) + i18n.
- **Дока одноразовой настройки**: проект в aaPanel стартует из `<APP_RELEASE_ROOT>/current` (симлинк → `releases/<стартовая-версия>`), команда запуска `next start`, `APP_VERSION` = текущая версия.
- Подпись артефактов (помимо sha256) — опционально.
- Адаптеры docker/systemd — позже, тем же интерфейсом.

Спека: `docs/superpowers/specs/2026-06-13-version-updates-design.md`.
