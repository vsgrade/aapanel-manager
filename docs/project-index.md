# Индекс проекта

> Карта репозитория — источник истины по структуре. Обновляется при **структурных** изменениях (добавил/удалил/переместил файл), не после каждой правки текста. См. [PROJECT_RULES.md](../PROJECT_RULES.md) §8.

**Тип проекта:** документация API (Markdown, RU + EN) + **Next.js-приложение** управления aaPanel (`web/`).
**Фаза:** приложение. Документация — снята (см. ниже). Приложение: Фаза 1 (фундамент) и Фаза 2 (серверы) готовы; источник истины — `docs/superpowers/specs/2026-06-08-aapanel-manager-app-design.md`.

## Структура

```
api aapanel/
├── CLAUDE.md                     # всегда-загружаемые правила (для ИИ)
├── PROJECT_RULES.md              # полный свод правил (для ИИ)
├── README.md                     # главная (EN)
├── README.ru.md                  # главная (RU)
├── LICENSE                       # MIT
├── .gitignore                    # игнор: .env, .mcp.json, node_modules, .playwright-mcp
├── .env.example                  # шаблон секретов (api_sk + сессия)
├── docs/
│   ├── project-index.md          # этот файл
│   ├── NAVIGATION.md             # быстрая навигация
│   ├── ru/{overview,authentication,nodejs-projects,sites,databases,files,ftp,cron,firewall,system-monitoring}.md
│   └── en/{overview,authentication,nodejs-projects,sites,databases,files,ftp,cron,firewall,system-monitoring}.md
└── examples/
    └── javascript/
        └── aapanel-client.ts     # обёртка над API (api_sk + сессия, server-side)
```

## Файлы

| Путь | Назначение | Зависит от / ссылается на | Что сломается при изменении |
|------|-----------|---------------------------|------------------------------|
| `README.md` / `README.ru.md` | Точка входа, обзор, пример, планы | ссылки на `docs/{en,ru}/*`, `examples/...` | битые ссылки при переименовании доков |
| `docs/{ru,en}/overview.md` | Контекст API, две схемы авторизации, рецепт | authentication, nodejs-projects, system-monitoring | — |
| `docs/{ru,en}/authentication.md` | `api_sk` + сессия, подпись, рецепт, SSL, безопасность | `.env.example`, `aapanel-client.ts` | рассинхрон с реальной авторизацией |
| `docs/{ru,en}/nodejs-projects.md` | 5 методов Node.js + реальные ответы | authentication.md | должен совпадать с `aapanel-client.ts` |
| `docs/{ru,en}/sites.md` | Сайты PHP/WP: list/create/delete + реальные ответы | authentication.md | сверять с реальными запросами панели |
| `docs/{ru,en}/databases.md` | MySQL + PostgreSQL CRUD; каждый движок — свой API | authentication.md | сверять с реальными запросами панели |
| `docs/{ru,en}/files.md` | Файловый менеджер `/v2/files`: CRUD, права, архивы, загрузка, загрузка по URL, пакетные операции, корзина | authentication.md | сверять с реальными запросами панели |
| `docs/{ru,en}/ftp.md` | FTP `/v2/ftp` + список `/v2/data` (`table=ftps`): CRUD, пароль, вкл/выкл | authentication.md | сверять с реальными запросами панели |
| `docs/{ru,en}/cron.md` | Планировщик `/v2/crontab`: список, создание, запуск, логи, статус, удаление | authentication.md | сверять с реальными запросами панели |
| `docs/{ru,en}/firewall.md` | Firewall `/v2/firewall/com`: чтение (статус, сводка, правила портов); запись — рецептом | authentication.md | сверять с реальными запросами панели |
| `docs/{ru,en}/system-monitoring.md` | `GetSystemTotal`, `GetDiskInfo` + реальные ответы | authentication.md | — |
| `examples/javascript/aapanel-client.ts` | Класс `AaPanelClient`: 2 режима авторизации, Node.js + система | Node 18+ (fetch, node:crypto), опц. `undici` | при смене сигнатур API — обновить и доку |
| `.env.example` | Шаблон переменных окружения | — | рассинхрон с тем, что читает обёртка |

## Приложение (web/) — Фаза 1–2

Next.js 16 (App Router, RSC, Server Actions) + TS strict + Prisma v7/Postgres + Auth.js v5 (JWT, роли) + Tailwind/shadcn (base-nova/Base UI) + TanStack Table v8 + next-intl (RU/EN). Подробности — спека приложения.

| Путь | Назначение |
|------|-----------|
| `web/src/lib/aapanel/{signing,client,types,index}.ts` | Типизированный клиент панели: подпись `api_sk`, `getSystemTotal`, самоподписанный TLS (undici), нормализованные ошибки; фабрика клиента под сервер (расшифровка ключа только на сервере) |
| `web/src/lib/crypto/secret-box.ts`, `lib/config/secrets.ts` | AES-256-GCM шифрование `api_sk` + доступ к ключу |
| `web/src/lib/validation/server.ts` | zod-схемы: create/update/test + устойчивые list-параметры (из URL) |
| `web/src/lib/servers/query.ts` | `listServers` — чтение из кеша (server-side фильтр/сортировка/пагинация; `apiSkEnc` не выбирается) |
| `web/src/lib/servers/sort.ts` | Чистая функция `cycleSort` — двухстатусный цикл сортировки таблицы серверов (asc ⇄ desc, без сброса в «без сортировки»); покрыта юнит-тестом |
| `web/src/lib/audit.ts`, `lib/utils/concurrency.ts` | Best-effort аудит; `mapLimit` (ограниченная параллельность) |
| `web/src/server/actions/servers.ts` | Server Actions: CRUD + testConnection + refresh (одной/видимых); проверка ролей + аудит (поллинг делегирован в `lib/servers/status`) |
| `web/src/lib/servers/status.ts` | Общий сервис статуса: опрос → апсерт кеша → `pg_notify` (исп. экшенами и воркером) |
| `web/src/lib/realtime/{channel,notify,server-events}.ts` | Канал событий + парсер; `NOTIFY` через Prisma; singleton `LISTEN` + раздача через EventEmitter |
| `web/src/app/api/sse/servers/route.ts` | SSE-поток статусов (с auth, heartbeat, очистка при отключении) |
| `web/src/components/servers/servers-live.tsx` | Клиент: EventSource → `router.refresh()` с дебаунсом |
| `web/src/worker/{index,poll-cycle}.ts` | Фоновый воркер: цикл опроса всех серверов (`pnpm worker`, отдельный процесс) |
| `web/src/lib/aapanel/client.ts` (+types) | Доп. методы: `getMetrics` (Обзор) + Node-проекты: чтение `listProjects`/`getProjectInfo`/`getProjectConfig`/`getRunList`/`getNodeVersions`/`getCreateEnv`; контроль `batchOperation`; CRUD `createProject`/`modifyProject`/`deleteProject`; логи `getProjectLogs` (api_sk, путь `/v2/project/nodejs/*`) |
| `web/src/server/actions/projects.ts` (+`lib/validation/project.ts`) | Server Actions страницы сервера: метрики, список проектов, контроль (start/stop/restart), логи; **CRUD проектов** — создание/изменение/удаление + загрузка данных форм (`getProjectEditData`/`getProjectCreateEnv`/`getRunList`); все мутации admin+аудит, удаление с подтверждением имени |
| `web/src/lib/servers/detail.ts` | `getServerForDetail` (публичные поля сервера для шапки) |
| `web/src/app/(app)/servers/[id]/` | Уровень 2: layout+меню разделов, Обзор (`page.tsx`, живые метрики), Проекты (`projects/page.tsx`) |
| `web/src/components/servers/detail/*` | section-nav, server-overview (опрос ~4с), metric-bar, projects-table (опрос ~12с) + project-form-dialog (создание/правка, выбор команды запуска из `package.json`) / project-logs-dialog / project-delete-dialog, databases-table, database-form/delete-dialog, server-switcher (Base UI Combobox: поиск + переход между серверами в тот же раздел) |
| `web/src/server/actions/databases.ts` (+`lib/validation/database.ts`) | Раздел БД: список/создание/удаление (MySQL+PostgreSQL, admin+аудит, удаление с подтверждением имени) |
| `web/src/lib/aapanel/client.ts` (DB-методы) | `listDatabases`/`createDatabase`/`deleteDatabase` — два движка (MySQL flat `/v2/data`,`/v2/database`; PG `/v2/database/pgsql/*` тело `data=JSON`); пароли БД вырезаются |
| `web/src/app/(app)/servers/[id]/databases/` | Раздел «Базы данных» (RSC) |
| `web/src/components/servers/*` | Таблица (TanStack v8), колонки, статус-бейдж, тулбар, диалоги add/edit/delete |
| `web/src/app/(app)/servers/{page,loading,error}.tsx` | Маршрут `/servers` (RSC) |
| `web/src/components/{theme-provider,theme-toggle}.tsx` | next-themes провайдер + 3-позиционный переключатель тем (светлая/серая-dim/тёмная) в шапке; палитры в `globals.css` |
| `web/messages/{ru,en}.json` | Строки UI (namespaces `servers`, `theme`, …) |

**Безопасность:** `api_sk` шифруется в покое; расшифровка только в Server Actions/фабрике (`server-only`); в кеш-выборку и клиент секрет не попадает; мутации — только admin; все мутации в `AuditLog`.

## Точки соответствия (держать синхронными)

- **`docs/*/nodejs-projects.md` + `system-monitoring.md` ↔ `aapanel-client.ts`** — методы и параметры должны совпадать.
- **RU ↔ EN** — четыре пары доков должны быть содержательно эквивалентны.
- **`.env.example` ↔ `aapanel-client.ts`** — имена переменных (`AAPANEL_BASE_URL`, `AAPANEL_API_SK`, сессионные).

## Ключевые факты (проверено на живой панели v8)

- Авторизация: **`api_sk`** (постоянный, на корне, `request_token=md5(request_time+md5(api_sk))`) **или** сессия (`apsess` + `x-http-token` + cookie, временная).
- `api_sk` покрывает **и** `/system?action=…`, **и** `/v2/project/nodejs/…`.
- `batch_operation_project`: поля `project_names` (JSON-массив) + `operation_type`, **без** обёртки `data=`.
- **Файлы** (`/v2/files`): плоские поля; одиночные удаления (`DeleteFile`/`DeleteDir`) уходят в корзину (`file_recycle`); пакетные операции — `SetBatchData` (`data=<json-массив>`, `type=4`=удаление); загрузка — чанковый `upload` (multipart: `f_path/f_name/f_size/f_start/blob`); корзина — `Get_/Re_/Del_/Close_Recycle_bin`; правка файла — `SaveFileBody` с `st_mtime`+`force` (оптимистичная блокировка); удаление навсегда/очистка корзины в UI требуют ручного ввода фразы (только UI-защита).
- **FTP** (`/v2/ftp`): список через общий `/v2/data` (`table=ftps`); CRUD по `id`+`username` (`AddUser`/`SetUserPassword`/`SetStatus` (`status` 0/1)/`DeleteUser`); `AddUser` создаёт каталог `path`, `DeleteUser` его не удаляет.
- **Cron** (`/v2/crontab`): `GetCrontab` (тело `search/type_id/order_param`); `AddCrontab` (богатое тело: `type`/`sType`/`sBody`/расписание) → `{result:"Add_success", id}`; запуск `StartTask` (`id`), лог `GetLogs` (`id`), статус `set_cron_status` (`id`+`if_stop`), удаление `DelCrontab` (`id`).
- **Firewall** (`/v2/firewall/com`): снято только **чтение** — `get_status`, `get_firewall_info` (бэкенд `ufw`/`firewalld`/`iptables`), `port_rules_list` (`chain/query/p/row`). Запись правил **не снималась** (security-sensitive, блокируется предохранителем harness) — снять рецептом под явной санкцией.
