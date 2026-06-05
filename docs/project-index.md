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
├── .gitignore                    # игнор: .env, node_modules, сборка
├── .env.example                  # шаблон секретов (без реальных значений)
├── docs/
│   ├── project-index.md          # этот файл
│   ├── NAVIGATION.md             # быстрая навигация
│   ├── ru/{overview,authentication,nodejs-projects}.md
│   └── en/{overview,authentication,nodejs-projects}.md
└── examples/
    └── javascript/
        └── aapanel-client.ts     # TypeScript-обёртка над API (server-side)
```

## Файлы

| Путь | Назначение | Зависит от / ссылается на | Что сломается при изменении |
|------|-----------|---------------------------|------------------------------|
| `README.md` / `README.ru.md` | Точка входа, обзор, быстрый старт | ссылки на `docs/{en,ru}/*`, `examples/...` | битые ссылки при переименовании доков |
| `docs/{ru,en}/overview.md` | Контекст API, две схемы авторизации | ссылки друг на друга и на authentication | — |
| `docs/{ru,en}/authentication.md` | Токен, формат запросов, SSL, безопасность | `.env.example` | рассинхрон с реальным форматом запросов |
| `docs/{ru,en}/nodejs-projects.md` | 6 методов API (ядро доки) | authentication.md | должен совпадать с `aapanel-client.ts` |
| `examples/javascript/aapanel-client.ts` | Обёртка: классы/методы под 6 эндпоинтов | Node 18+ (fetch), опц. `undici` | при смене сигнатур API — обновить и доку |
| `.env.example` | Шаблон переменных окружения | — | рассинхрон с тем, что читает обёртка |

## Точки соответствия (держать синхронными)

- **`docs/*/nodejs-projects.md` ↔ `examples/javascript/aapanel-client.ts`** — методы и параметры должны совпадать.
- **RU ↔ EN** — три пары доков должны быть содержательно эквивалентны.
- **`.env.example` ↔ `aapanel-client.ts`** — имена переменных (`AAPANEL_BASE_URL`, `AAPANEL_SESSION_TOKEN`).
