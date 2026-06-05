# Документация API aaPanel — управление Node.js-проектами

> Неофициальная community-документация по управлению **Node.js-проектами** через API aaPanel — раздел, который в официальной доке почти не описан.

🌍 **Язык:** **Русский** · [English](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## Что это?

[aaPanel](https://www.aapanel.com/) (международная версия панели BT/宝塔) — это веб-панель управления Linux-сервером. Её можно автоматизировать через HTTP API, но официальная документация неполная — в частности, управление Node.js-проектами не описано. Этот репозиторий закрывает пробел.

Методы здесь получены так, как сам aaPanel рекомендует для недокументированных функций: наблюдением за запросами панели в DevTools браузера.

## Документация

| Документ | Содержание |
|----------|-----------|
| 📖 [Обзор](docs/ru/overview.md) | Что такое API aaPanel; две схемы авторизации (официальный `api_sk` vs внутренний сессионный токен) |
| 🔑 [Аутентификация](docs/ru/authentication.md) | Сессионный токен, формат запросов, нюанс SSL, безопасность |
| 🟢 [Node.js-проекты](docs/ru/nodejs-projects.md) | 6 методов: список, инфо, команды запуска, версии, старт/стоп/рестарт, настройки |

## Пример кода

Готовая обёртка на TypeScript: [`examples/javascript/aapanel-client.ts`](examples/javascript/aapanel-client.ts).

```ts
import { AaPanelNodeClient } from "./examples/javascript/aapanel-client";

const client = new AaPanelNodeClient({
  baseUrl: process.env.AAPANEL_BASE_URL!,        // https://<сервер>:<порт>
  sessionToken: process.env.AAPANEL_SESSION_TOKEN!, // apsess_...
});

await client.listProjects();
await client.startProject("crmtest2");
```

> ⚠️ **Только на стороне сервера.** Сессионный токен и `api_sk` — секреты, их нельзя показывать в коде браузера. См. [Аутентификация → Безопасность](docs/ru/authentication.md#безопасность).

## Быстрый старт (curl)

```bash
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/<SESSION_TOKEN>/v2/project/nodejs/get_project_list" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'data={"p":1,"limit":10,"search":"","re_order":""}'
```

## Планы

- [x] Управление Node.js-проектами
- [ ] Сайты, базы данных, FTP, SSL, бэкапы (официальный API `api_sk`)
- [ ] Next.js-приложение для управления панелью поверх этого API (бэкенд-прокси)

## Дисклеймер

Документация неофициальная. Поведение может меняться при обновлении aaPanel — сверяйтесь со своей панелью. Официальная дока: [aapanel.com/docs](https://www.aapanel.com/docs/).

## Лицензия

[MIT](LICENSE)
