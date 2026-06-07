# Документация API aaPanel — Node.js-проекты и мониторинг сервера

> Неофициальная community-документация по API aaPanel — **управление Node.js-проектами** и **мониторинг сервера** — проверено на живой панели (v8).

🌍 **Язык:** **Русский** · [English](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Что это?

[aaPanel](https://www.aapanel.com/) (международная версия панели BT/宝塔) — это веб-панель управления Linux-сервером. Её можно автоматизировать через HTTP API, но официальная документация неполная — в частности, управление Node.js-проектами не описано. Этот репозиторий закрывает пробел **реальными, проверенными** примерами запросов и ответов.

**Главная находка:** один постоянный ключ `api_sk`, используемый на корне панели, покрывает **и** официальные эндпоинты (`/system?action=…`), **и** внутренние (`/v2/project/nodejs/…`) — то есть приложение может управлять всем одним стабильным ключом.

## Документация

| Документ | Содержание |
|----------|-----------|
| 📖 [Обзор](docs/ru/overview.md) | Что такое API aaPanel; две схемы авторизации; рецепт «разведка→исполнение» |
| 🔑 [Аутентификация](docs/ru/authentication.md) | Ключ `api_sk` (рекомендуется) vs сессия; подпись запроса; SSL; безопасность |
| 🟢 [Node.js-проекты](docs/ru/nodejs-projects.md) | список, инфо, команды, версии, старт/стоп — с реальными ответами |
| 🌐 [Сайты (PHP/WP)](docs/ru/sites.md) | список, создание, удаление сайтов |
| 🗄️ [Базы данных](docs/ru/databases.md) | MySQL + PostgreSQL CRUD (у каждого движка свой API) |
| 📊 [Мониторинг сервера](docs/ru/system-monitoring.md) | CPU / RAM / диск (`GetSystemTotal`, `GetDiskInfo`) |

## Пример кода

Готовая обёртка на TypeScript (авторизация ключом **или** сессией): [`examples/javascript/aapanel-client.ts`](examples/javascript/aapanel-client.ts).

```ts
import { AaPanelClient } from "./examples/javascript/aapanel-client";

const client = new AaPanelClient({
  baseUrl: process.env.AAPANEL_BASE_URL!,                  // https://<сервер>:<порт> (корень!)
  auth: { mode: "apiKey", apiSk: process.env.AAPANEL_API_SK! },
  insecureTLS: true,                                       // самоподписанный сертификат
});

await client.listProjects();        // имена, статус (запущен/остановлен), CPU/RAM
await client.getSystemTotal();      // CPU / RAM / ядра сервера
await client.startProject("myapp");
```

> ⚠️ **Только на стороне сервера.** `api_sk` даёт полный доступ к серверу — никогда не показывай его в коде браузера. См. [Аутентификация → Безопасность](docs/ru/authentication.md#безопасность).

## Рецепт (официальный способ aaPanel)

Функция не описана? Открой панель → DevTools (Network) → нажми её → посмотри запрос → повтори **тот же путь и тело** с авторизацией `api_sk`. См. [Аутентификация](docs/ru/authentication.md#-рецепт-разведка--исполнение-официальный-способ-aapanel).

## Планы

- [x] Управление Node.js-проектами (список, инфо, команды, версии, старт/стоп/рестарт, изменение, удаление)
- [x] Сайты (PHP/WP): список, создание, удаление
- [x] Базы данных (MySQL + PostgreSQL, CRUD)
- [x] Мониторинг сервера (CPU/RAM/диск)
- [x] Проверено: `api_sk` покрывает и внутренние эндпоинты
- [ ] Другие модули (FTP, SSL, cron, бэкапы)
- [ ] Next.js-приложение для управления панелью поверх этого API (бэкенд-прокси, `api_sk`)

## Дисклеймер

Документация неофициальная. Проверено на aaPanel v8; поведение может меняться между версиями — сверяйтесь со своей панелью. Официальная дока: [aapanel.com/docs](https://www.aapanel.com/docs/).

## Лицензия

[MIT](LICENSE)
