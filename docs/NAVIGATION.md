# Навигация

Быстрые ссылки по репозиторию. Подробная карта — [project-index.md](project-index.md).

## Документация

| Тема | 🇷🇺 Русский | 🇬🇧 English |
|------|-------------|-------------|
| Обзор API / две схемы авторизации / рецепт | [ru/overview](ru/overview.md) | [en/overview](en/overview.md) |
| Аутентификация (`api_sk` + сессия), SSL, безопасность | [ru/authentication](ru/authentication.md) | [en/authentication](en/authentication.md) |
| Node.js-проекты (список, инфо, старт/стоп…) | [ru/nodejs-projects](ru/nodejs-projects.md) | [en/nodejs-projects](en/nodejs-projects.md) |
| Сайты PHP/WP (список, создать, удалить) | [ru/sites](ru/sites.md) | [en/sites](en/sites.md) |
| Базы данных (MySQL + PostgreSQL, CRUD) | [ru/databases](ru/databases.md) | [en/databases](en/databases.md) |
| Файлы (менеджер: CRUD, права, архивы, загрузка, корзина) | [ru/files](ru/files.md) | [en/files](en/files.md) |
| FTP (пользователи: CRUD, пароль, вкл/выкл) | [ru/ftp](ru/ftp.md) | [en/ftp](en/ftp.md) |
| Планировщик / Cron (задачи: CRUD, запуск, логи) | [ru/cron](ru/cron.md) | [en/cron](en/cron.md) |
| Firewall / Безопасность (чтение: статус, сводка, правила портов) | [ru/firewall](ru/firewall.md) | [en/firewall](en/firewall.md) |
| Мониторинг сервера (CPU/RAM/диск) | [ru/system-monitoring](ru/system-monitoring.md) | [en/system-monitoring](en/system-monitoring.md) |

## Код

- TypeScript-обёртка (`AaPanelClient`, 2 режима авторизации): [`examples/javascript/aapanel-client.ts`](../examples/javascript/aapanel-client.ts)
- Шаблон окружения: [`.env.example`](../.env.example)

## Приложение (web/)

- Спека: [aapanel-manager-app-design](superpowers/specs/2026-06-08-aapanel-manager-app-design.md)
- Планы: [Фаза 1 — фундамент](superpowers/plans/2026-06-08-phase-1-foundation.md) · [Фаза 2 — серверы](superpowers/plans/2026-06-09-phase-2-servers.md) · [Фаза 3 — живой дашборд](superpowers/plans/2026-06-09-phase-3-live-dashboard.md) · [Фаза 4 — Обзор+Проекты](superpowers/plans/2026-06-09-phase-4-overview-projects.md)
- Страница сервера: `web/src/app/(app)/servers/[id]/` (Обзор+Проекты+Базы данных) · экшены `web/src/server/actions/{projects,databases}.ts`
- Разделы (Фаза 5): [Базы данных](superpowers/plans/2026-06-09-phase-5a-databases.md) — `/servers/[id]/databases`
- Маршрут серверов: `web/src/app/(app)/servers/page.tsx` · Server Actions: `web/src/server/actions/servers.ts` · клиент панели: `web/src/lib/aapanel/`
- Live: воркер `web/src/worker/` · сервис статуса `web/src/lib/servers/status.ts` · realtime `web/src/lib/realtime/` · SSE `web/src/app/api/sse/servers/route.ts`

## Главные страницы

- [README (EN)](../README.md) · [README (RU)](../README.ru.md)

## Правила проекта (для ИИ)

- [CLAUDE.md](../CLAUDE.md) — всегда в контексте
- [PROJECT_RULES.md](../PROJECT_RULES.md) — полный свод
