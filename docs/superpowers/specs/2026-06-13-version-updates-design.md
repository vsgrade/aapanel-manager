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

## Фаза 2a — реализовано (детали, режим aaPanel)

Согласовано 2026-06-20: начали с режима **aaPanel Node-проект**. Заход 2a = прерэквизит + **подготовка** обновления, **без самоперезапуска** (активация/откат — 2b). aaPanel выступает «надсмотрщиком»; отдельный процесс не плодим.

**Архитектура (новое):** `lib/deploy/`
- `adapter.ts` — интерфейс `DeployAdapter` (`preflight()`, `stage(input)`); `activate()/rollback()` добавятся в 2b (без заглушек сейчас).
- `aapanel.ts` — `AaPanelDeployAdapter`: `stage()` = preflight → найти бандл → скачать → проверить sha256 → атомарно распаковать (`<v>.partial` → rename) → бэкап БД → миграции → пометить `stagedVersion`.
- `layout.ts` (чистый) — раскладка `<root>/{releases/<v>,current,backups,tmp}`; `sanitizeVersion()` — строгий semver-сегмент (защита от path-traversal); имена asset'ов.
- `bundle-assets.ts` (чистый, без `server-only`) — поиск asset'ов релиза, parse/`sha256`. Вынесен отдельно, чтобы Server Action импортировал без FS-слоя.
- `bundle.ts` (server-only IO) — `downloadToFile`, `verifyFileChecksum`, `extractTarGz` (системный `tar`, без новой зависимости).
- `db-backup.ts` — `pg_dump`; креды через **env дочернего процесса** (`PGPASSWORD`), не через argv (иначе видно в `ps`); `PgDumpNotAvailableError` → блок или явный override.
- `migrate.ts` — `prisma migrate deploy` из распакованного релиза; миграции **expand/contract** (безопасны при работающем старом коде).
- `index.ts` — фабрика по `deploymentMode` (сейчас только `aapanel`; прочие → null = «staging не поддержан»).

**Прочее:** `UpdateSettings.stagedVersion/stagedAt` (миграция `add_staged_release`); `env.APP_RELEASE_ROOT` (опц.; пусто → staging выключен); `GithubRelease.assets[]`; `GET /api/health` `{ok,version,commit,buildTime}` (публичный); `stageUpdateAction` (admin+аудит `updates.stage`); статус отдаёт `deploymentMode/stagedVersion/stagingSupported/bundleAvailable`.

**Контракт бандла релиза:** asset `aapanel-manager-bundle-<version>.tar.gz` (+ `.sha256`). Решение (2026-06-20): **полный собранный бандл** (полные `node_modules` вкл. prisma CLI + `.next` + `public` + `prisma/` + `prisma.config.ts` + `package.json`/локфайлы + `next.config.ts` + `scripts/`), а не Next-standalone. Причина: `prisma migrate deploy` работает «из коробки» (как проверенный Docker-worker), сборка надёжна и проверяема в CI; приложение запускается через `next start`. Цена — больший размер скачивания (приемлемо для сервера). Распакованный бандл = рабочая директория релиза (`releases/<v>`), из которой идут и миграции, и запуск.

**Прерэквизит — СДЕЛАНО (PR #1, в `main`):** релизный пайплайн собирает бандл + `.sha256` и **самопроверяет** его в CI (job `release-bundle`: Postgres → распаковка → `prisma migrate deploy` из бандла → `next start` → `/api/health`). Скрипты `web/scripts/{build,smoke}-release-bundle.mjs`; `release.yml` прикладывает бандл к релизу после smoke. Проверено зелёным прогоном CI.

**Статус гейта 2a:** typecheck ✓ · lint ✓ (0 ошибок) · 235 тестов ✓ · build ✓ · CI (включая bundle-smoke) ✓.

## Фаза 2b — реализовано (backend; UI — следующим заходом)

Активация подготовленного релиза и откат, режим aaPanel.

- **`DeployAdapter`** дополнен `activate(input)` + `rollback(input)`; `aapanel.ts` реализует через общий `swapAndRestart`:
  1. проверка, что целевая `releases/<v>` существует (не перезапускаемся в пустоту);
  2. определить текущую версию (цель будущего отката) — из симлинка `current`, иначе `runningVersion`;
  3. **атомарный своп**: временный симлинк → `releases/<v>`, затем `rename` поверх `current`;
  4. `recordActivation(v, previous)` — `VersionHistory` + `previousVersion` + очистка `staged` (транзакция, ДО рестарта);
  5. **рестарт последним** — `input.restart()` (может убить процесс).
- **Перезапуск себя** инъектируется как `restart()` (не зашит → тестируемо): действие строит `createClientForServer(server).batchOperation([project],'restart')` — рестарт **своего** Node-проекта через aaPanel API.
- **Действия** (admin + аудит): `activateUpdateAction()` (берёт `stagedVersion`), `rollbackUpdateAction(toVersion)`; `prepareSelfRestart()` валидирует режим/конфиг/наличие сервера.
- **Prisma**: `UpdateSettings.previousVersion` (миграция `add_previous_version`); `recordActivation` в `settings.ts`.
- **Тесты**: `aapanel.test.ts` (порядок swap→record→restart; нет рестарта без релиза; откат; нет root) + действия.

**Одноразовая настройка деплоя (оператор; полная дока — с UI):** проект в aaPanel запускается из `<APP_RELEASE_ROOT>/current` (симлинк → `releases/<стартовая-версия>`); команда запуска = `next start`; `APP_VERSION` = текущая версия. Тогда «Применить»/«Откатить» лишь переключают симлинк и дёргают рестарт.

**Ограничение v1 (честно):** если новая версия совсем не стартует, кнопку отката в панели не нажать → откат вручную на сервере (переключить `current` + рестарт). Авто-откат по неудачному health — поздний заход (watchdog, переживающий рестарт).

**UI (сделано):** `components/settings/update-actions.tsx` в карточке статуса (только при `stagingSupported`): «Подготовить {v}» → «Применить» → «Откатить на {v}», подтверждение через `Dialog`, поллинг `/api/health` после рестарта (устойчив к обрыву соединения при перезапуске); i18n ru/en. Дока одноразовой настройки — в `docs/RELEASING.md`.

**Статус гейта 2b (backend+UI):** typecheck ✓ · lint ✓ (0 ошибок) · 252 теста ✓ · build ✓.

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
