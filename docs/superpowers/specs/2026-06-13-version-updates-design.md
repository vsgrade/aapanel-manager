# Дизайн: раздел «Версии и обновления» + самообновление панели

> Спека. Источник истины по фиче. Согласовано в обсуждении 2026-06-13.
> Реализация — фазами. Фаза 1 (этот документ детально) + набросок Фазы 2.

## Цель

Дать администратору панели:
1. видеть **текущую** версию приложения и **последнюю доступную** (с GitHub Releases) + changelog;
2. **обновлять** и **откатывать** панель прямо из админки (Фаза 2);
3. при этом панель устанавливается у разных пользователей по-разному (Docker / systemd / Node-проект в aaPanel), и механизм обновления должен это учитывать.

## Что важно понимать про «перезапуск»

Есть **два разных** перезапуска, их нельзя путать:
- перезапуск **чужого** Node-проекта на управляемом сервере — это уже сделано (`batch_operation_project`), команда запуска из `package.json` того проекта;
- перезапуск **самой админки** после обновления — предмет этой фичи; зависит от способа её установки.

Процесс не может чисто перезапустить сам себя (убьёт процесс на запросе) — нужен внешний триггер (Docker/PM2/systemd или aaPanel API).

## Способы установки (режимы деплоя)

| Режим | Как перезапуск | Как обновление | api_sk нужен? |
|-------|----------------|----------------|----------------|
| **docker** (рекоменд.) | `docker compose up -d` | pull образа по digest → up -d (прогоняет `migrate`) | нет |
| **systemd / pm2** | `systemctl restart` / `pm2 restart` | скачать готовый бандл / git pull → migrate → restart | нет |
| **aapanel** (Node-проект в aaPanel) | `batch_operation_project(restart)` через наш API | скачать готовый standalone-бандл → migrate → restart через API | да (свой сервер) |
| **manual** | — | панель только показывает команду | нет |

Каждый режим — отдельный **адаптер деплоя** (общий интерфейс, сменная реализация). Так добавление/замена режима не ломает остальное.

## Архитектура

```
lib/version/
  current.ts        # текущая версия: env APP_VERSION → fallback package.json; + commit/buildTime
  semver.ts         # сравнение версий (compare/isNewer), без внешних зависимостей
  github.ts         # GitHub Releases API: latest + список релизов; кэш + обработка ошибок/приватный репо
  settings.ts       # чтение/запись UpdateSettings (server-only; токен шифруется secret-box)
lib/deploy/
  adapter.ts        # интерфейс DeployAdapter (describeUpdateCommand / applyUpdate / rollback) — Фаза 2
  {docker,systemd,aapanel,manual}.ts  # реализации (Фаза 2; в Фазе 1 — только describeUpdateCommand)
server/actions/updates.ts  # getUpdateStatus / getUpdateSettings / saveUpdateSettings / (Фаза 2: applyUpdate / rollback)
app/(app)/settings/        # RSC-страница «Настройки», admin-only, с разделом «Обновления»
components/settings/*       # update-status, update-settings-form, version-history
```

## Модель данных (Prisma) — миграция

```prisma
/// Единственная строка настроек обновления (id фиксирован).
model UpdateSettings {
  id              String   @id @default("singleton")
  deploymentMode  String   @default("manual")  // docker | systemd | aapanel | manual
  githubOwner     String   @default("")
  githubRepo      String   @default("")
  githubTokenEnc  String?                       // зашифрован (приватный репо)
  // aapanel-режим:
  aapanelServerId String?                       // какой сервер хостит панель
  aapanelProject  String?                       // имя её Node-проекта в aaPanel
  startScript     String?                       // project_script из package.json
  // systemd/pm2/docker:
  serviceName     String?                       // имя сервиса/pm2-приложения
  updatedAt       DateTime @updatedAt
  createdAt       DateTime @default(now())
}

/// История установленных версий (для отображения и будущего отката).
model VersionHistory {
  id          String   @id @default(cuid())
  version     String
  installedAt DateTime @default(now())
  note        String?
  @@index([installedAt])
}
```

## Фаза 1 — раздел «Версии и обновления» (только чтение) + настройки

### Текущая версия
`getCurrentVersion()` → `{version, commit?, buildTime?}`:
- `version`: `process.env.APP_VERSION` (Docker build-arg / env) → иначе из `package.json` (есть в dev / worker / aapanel-режиме).
- `commit`/`buildTime`: из env `APP_COMMIT` / `APP_BUILD_TIME`, если заданы (опционально).
- При старте/первом заходе записываем текущую версию в `VersionHistory`, если её там ещё нет (история).

### Проверка обновлений (GitHub Releases)
- `GET https://api.github.com/repos/{owner}/{repo}/releases` (и `/releases/latest`).
- Кэш через `fetch(..., {next:{revalidate:3600}})` — не чаще раза в час (лимит 60 запросов/час без токена).
- Приватный репо → заголовок `Authorization: Bearer <token>` (токен из настроек, расшифровка только на сервере).
- Обработка: репо не задан → «не настроено»; сеть/лимит/404 → дружелюбное сообщение, без падения.
- Сравнение semver: `isNewer(latest, current)` → бейдж «доступно обновление».

### Настройки (форма, admin-only)
- Способ установки (select: docker/systemd/aapanel/manual) — c автоопределением дефолта (контейнер? → docker).
- GitHub репозиторий (`owner/repo`), приватный (→ токен), канал (stable).
- Поля под режим: aapanel → сервер + имя проекта + команда запуска (выбор из `package.json` через `get_run_list`); docker/systemd → имя сервиса.
- **Без произвольных shell-команд** (это RCE-дыра). Только структурированные поля; в aapanel-режиме команда = валидируемый ключ скрипта.

### UI
- Маршрут `(/app)/settings` (RSC, admin-only). Раздел «Обновления»:
  - текущая версия (+commit/время сборки),
  - последняя доступная + дата + changelog (collapsible),
  - бейдж «обновление доступно»,
  - **готовая команда обновления** под выбранный режим (скопировать),
  - история версий,
  - форма настроек.
- Пункт в навигации (admin-only).

### Безопасность (🔴)
- Всё — только `admin` (гварды + аудит изменения настроек).
- GitHub-токен шифруется (`secret-box`, как `api_sk`); в клиент не отдаётся.
- Никаких произвольных команд из UI.
- Чтение GitHub — server-side (RSC/Server Action), не из браузера.

## Фаза 2 — кнопки «Обновить» / «Откатить» (набросок, 🔴, отдельно)

- `DeployAdapter`: `applyUpdate(targetVersion)`, `rollback(targetVersion)`, `currentRuntimeInfo()`.
- **docker**: updater-сервис с доступом к docker.sock или host-агент: `pull` по **digest** → `up -d` (прогон `migrate`).
- **aapanel**: скачать **готовый standalone-бандл** релиза (без сборки на сервере) → `prisma migrate deploy` → `batch_operation_project(restart)` через наш API.
- **systemd/pm2**: скачать бандл → migrate → `restart` через минимального привилегированного помощника.
- **Перед обновлением — бэкап БД**; откат кода тривиален (вернуть образ/бандл), откат БД — из бэкапа (с явным предупреждением о потере данных после обновления) либо обратно-совместимые миграции (expand/contract).
- **Проверка целостности** скачанного: digest образа / checksum (или подпись) релиза.
- UI: «Обновить до vX» / «Откатить на vY» с подтверждением; статус-поток (началось → перезапуск → новая версия поднялась); запись в `VersionHistory` + аудит.

## Открытые вопросы (на потом)
- Имя официального GitHub-репозитория (пока — настраиваемое поле, по умолчанию пусто).
- Формат публикации релизов: Docker-образ в GHCR + standalone-бандл-артефакт.
- Нужна ли страница «Настройки» как общий контейнер для будущих настроек (да — закладываем расширяемо).

## Разбивка Фазы 1 на задачи
1. Prisma: `UpdateSettings` + `VersionHistory` + миграция.
2. `lib/version/semver.ts` + тесты.
3. `lib/version/current.ts` + тесты.
4. `lib/version/github.ts` (+кэш, ошибки, приватный репо) + тесты.
5. `lib/version/settings.ts` (server-only, шифрование токена).
6. `lib/validation/update-settings.ts` (zod) + тесты.
7. `server/actions/updates.ts` + тесты.
8. UI: `(/app)/settings` + компоненты статуса/формы/истории; пункт навигации.
9. i18n ru/en.
10. Гейт (typecheck/lint/test/build) + обновить `project-index.md` / `NAVIGATION.md`.
