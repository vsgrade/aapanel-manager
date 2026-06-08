# Индекс проекта

> Карта репозитория — источник истины по структуре. Обновляется при **структурных** изменениях (добавил/удалил/переместил файл), не после каждой правки текста. См. [PROJECT_RULES.md](../PROJECT_RULES.md) §8.

**Тип проекта:** документация (Markdown, RU + EN) + пример-обёртка на TypeScript.
**Фаза:** документация. Следующая фаза — Next.js-приложение (см. README → Планы).

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
│   ├── ru/{overview,authentication,nodejs-projects,sites,databases,files,system-monitoring}.md
│   └── en/{overview,authentication,nodejs-projects,sites,databases,files,system-monitoring}.md
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
| `docs/{ru,en}/system-monitoring.md` | `GetSystemTotal`, `GetDiskInfo` + реальные ответы | authentication.md | — |
| `examples/javascript/aapanel-client.ts` | Класс `AaPanelClient`: 2 режима авторизации, Node.js + система | Node 18+ (fetch, node:crypto), опц. `undici` | при смене сигнатур API — обновить и доку |
| `.env.example` | Шаблон переменных окружения | — | рассинхрон с тем, что читает обёртка |

## Точки соответствия (держать синхронными)

- **`docs/*/nodejs-projects.md` + `system-monitoring.md` ↔ `aapanel-client.ts`** — методы и параметры должны совпадать.
- **RU ↔ EN** — четыре пары доков должны быть содержательно эквивалентны.
- **`.env.example` ↔ `aapanel-client.ts`** — имена переменных (`AAPANEL_BASE_URL`, `AAPANEL_API_SK`, сессионные).

## Ключевые факты (проверено на живой панели v8)

- Авторизация: **`api_sk`** (постоянный, на корне, `request_token=md5(request_time+md5(api_sk))`) **или** сессия (`apsess` + `x-http-token` + cookie, временная).
- `api_sk` покрывает **и** `/system?action=…`, **и** `/v2/project/nodejs/…`.
- `batch_operation_project`: поля `project_names` (JSON-массив) + `operation_type`, **без** обёртки `data=`.
- **Файлы** (`/v2/files`): плоские поля; одиночные удаления (`DeleteFile`/`DeleteDir`) уходят в корзину (`file_recycle`); пакетные операции — `SetBatchData` (`data=<json-массив>`, `type=4`=удаление); загрузка — чанковый `upload` (multipart: `f_path/f_name/f_size/f_start/blob`); корзина — `Get_/Re_/Del_/Close_Recycle_bin`; правка файла — `SaveFileBody` с `st_mtime`+`force` (оптимистичная блокировка); удаление навсегда/очистка корзины в UI требуют ручного ввода фразы (только UI-защита).
