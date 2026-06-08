# Управление Node.js-проектами

[English version](../en/nodejs-projects.md) · [⌂ Главная](../../README.ru.md)

Методы управления Node.js-проектами в aaPanel. Перед чтением — [authentication.md](authentication.md) (как авторизоваться: ключ `api_sk` или сессия).

**Базовый путь (через ключ `api_sk`, рекомендуется):**
```
POST https://<СЕРВЕР>:<ПОРТ>/v2/project/nodejs/<метод>
```
К телу добавляются `request_time` и `request_token` (см. [authentication.md](authentication.md)).
Тело: `Content-Type: application/x-www-form-urlencoded`. Параметры метода — в поле `data=<URL-encoded JSON>` (кроме `batch_operation_project`, см. ниже).

> Все примеры ответов ниже — **реальные** (с живой панели v8), значения обезличены.

## Соглашение об ответах

Поле `status` в ответе: **`0`** — успех, **`-1`** (или `false`) — ошибка. Полезные данные — в `message`.

## Список методов

| # | Метод | Назначение |
|---|-------|-----------|
| 1 | [`get_project_list`](#1-get_project_list) | Список проектов + статусы + CPU/RAM |
| 2 | [`get_project_info`](#2-get_project_info) | Информация об одном проекте |
| 3 | [`get_run_list`](#3-get_run_list) | Команды запуска из `package.json` |
| 4 | [`get_nodejs_version`](#4-get_nodejs_version) | Доступные версии Node.js |
| 5 | [`batch_operation_project`](#5-batch_operation_project) | Старт / стоп / рестарт / **удаление** |
| 6 | [`modify_project`](#6-modify_project) | Изменить настройки проекта |
| 7 | [`pre_env`](#7-pre_env) | Метаданные для формы создания (версии Node, менеджеры пакетов, пользователи) |
| 8 | [`create_project`](#8-create_project) | Создать новый проект |

---

## 1. `get_project_list`

Список проектов с пагинацией. **Главный метод для дашборда** — отдаёт сразу имена, статусы (запущен/остановлен), CPU/RAM каждого проекта.

**Параметры (`data`):**
```json
{ "p": 1, "limit": 10, "search": "", "re_order": "" }
```
| Параметр | Тип | Описание |
|----------|-----|----------|
| `p` | int | Страница (с 1) |
| `limit` | int | Количество на странице |
| `search` | string | Поиск по имени |
| `re_order` | string | Сортировка |

**Реальный ответ (обезличено, один проект для примера):**
```json
{
  "status": 0,
  "timestamp": 1780655689,
  "message": {
    "page": "<div><span class='Pcurrent'>1</span><span class='Pcount'>Total 3</span></div>",
    "shift": "0",
    "row": "10",
    "data": [
      {
        "id": 4,
        "name": "myapp",
        "path": "/www/node-projects/myapp/",
        "status": "1",
        "ps": "myapp 3003",
        "addtime": "2026-02-03 03:22:24",
        "project_type": "Node",
        "project_config": {
          "project_name": "myapp",
          "project_cwd": "/www/node-projects/myapp/",
          "project_script": "prod:start",
          "bind_extranet": 1,
          "domains": ["myapp.example.com:80"],
          "is_power_on": 0,
          "run_user": "www",
          "max_memory_limit": 4096,
          "nodejs_version": "v24.13.0",
          "port": 3003,
          "log_path": "/www/wwwlogs/nodejs"
        },
        "load_info": {
          "1162208": {
            "name": "MainThread",
            "pid": 1162208,
            "status": "Sleeping",
            "user": "www",
            "memory_used": 208945152,
            "cpu_percent": 0.09,
            "threads": 18,
            "exe": "node server.js"
          }
        },
        "run": true,
        "listen": [3003],
        "listen_ok": true
      }
    ]
  }
}
```

**Ключевые поля:**
| Поле | Что значит |
|------|-----------|
| `run` | **`true` — запущен, `false` — остановлен** |
| `name` | имя проекта |
| `project_config.port` | порт |
| `project_config.nodejs_version` | версия Node.js |
| `project_config.domains` | привязанные домены |
| `load_info.<pid>.cpu_percent` | загрузка CPU процессом (%) |
| `load_info.<pid>.memory_used` | память процесса, **байты** |
| `load_info` | пустой `{}`, если проект остановлен |

---

## 2. `get_project_info`

Информация об одном проекте (та же структура, но без массива `data`).

**Параметры (`data`):** `{ "project_name": "myapp" }`

**Реальный ответ (обезличено):**
```json
{
  "status": 0,
  "message": {
    "id": 3, "name": "myapp", "path": "/www/node-projects/myapp/",
    "project_type": "Node",
    "project_config": {
      "project_name": "myapp", "project_cwd": "/www/node-projects/myapp/",
      "project_script": "start", "port": 3002, "run_user": "www",
      "nodejs_version": "v24.13.0", "is_power_on": 1,
      "domains": ["myapp.example.com:80"], "max_memory_limit": 4096
    },
    "load_info": {}, "run": false, "listen": [], "listen_ok": true
  }
}
```

---

## 3. `get_run_list`

Команды запуска из секции `scripts` файла `package.json`.

**Параметры (`data`):** `{ "project_cwd": "/www/node-projects/myapp/" }`

**Реальный ответ (успех):**
```json
{
  "status": 0,
  "message": {
    "start": "node server.js",
    "dev": "next dev -p 3002",
    "build": "next build",
    "prod:start": "npm run start"
  }
}
```

**Реальный ответ (ошибка — путь не существует):**
```json
{ "status": -1, "message": { "status_code": -1, "error_msg": "Каталог проекта не существует!", "data": "Каталог проекта не существует!" } }
```

> ⚠️ Путь должен быть в кодировке UTF-8. Нелатинские символы в пути (например кириллица) корректно URL-кодируйте.

---

## 4. `get_nodejs_version`

Установленные в панели версии Node.js.

**Параметры (`data`):** пустое (`data=`).

**Реальный ответ:**
```json
{ "status": 0, "message": ["v22.22.0", "v24.13.0"] }
```

---

## 5. `batch_operation_project`

Запуск / остановка / перезапуск одного или нескольких проектов.

> ⚠️ **Внимание:** формат запроса **не такой**, как у других методов. Параметры передаются **напрямую** (не в `data=`), а имена проектов — JSON-массивом:

**Тело запроса (form-urlencoded):**
```
project_names=["myapp"]&operation_type=start
```
| Параметр | Тип | Описание |
|----------|-----|----------|
| `project_names` | JSON-массив строк | имена проектов, напр. `["myapp"]` или `["a","b"]` |
| `operation_type` | string | `start`, `stop`, `restart`, **`delete`** |

> ⚠️ Вживую подтверждены `start` и `delete`. `stop` / `restart` используют тот же формат (то же поле `operation_type`).
> **Важно:** удаление Node-проекта идёт через **этот же** метод (`operation_type=delete`), отдельного эндпоинта нет. Удаляется только регистрация проекта в панели — **каталог проекта на диске остаётся** (диалог удаления не предлагает удалить каталог, в отличие от сайтов).

**Удаление — тело запроса:**
```
project_names=["myapp"]&operation_type=delete
```
**Реальный ответ (удаление):**
```json
{
  "status": 0,
  "message": {
    "msg": "Successfully 1 items.Failed on 0 projects.",
    "msg_list": [ { "name": "myapp", "status": true, "msg": "Operation successful." } ]
  }
}
```

**Пример (curl, авторизация ключом):**
```bash
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/v2/project/nodejs/batch_operation_project" \
  --data-urlencode "request_time=$T" --data-urlencode "request_token=$TOKEN" \
  --data-urlencode 'project_names=["myapp"]' \
  --data-urlencode 'operation_type=start'
```

**Реальный ответ:**
```json
{
  "status": 0,
  "message": {
    "msg": "Successfully 1 items.Failed on 0 projects.",
    "msg_list": [ { "name": "myapp", "status": true, "msg": "Запущено успешно" } ]
  }
}
```

---

## 6. `modify_project`

Изменить настройки существующего проекта (имя, порт, скрипт запуска, версию Node, описание, автозапуск). Открытие формы «Изменить» в панели сначала загружает данные через [`get_project_info`](#2-get_project_info) + [`get_run_list`](#3-get_run_list) + [`get_nodejs_version`](#4-get_nodejs_version), а сохранение шлёт `modify_project`.

**Параметры (`data`):**
```json
{
  "project_cwd": "/www/node-projects/myapp/",
  "project_name": "myapp",
  "project_script": "prod:start",
  "port": "3003",
  "run_user": "www",
  "nodejs_version": "v24.13.0",
  "project_ps": "myapp 3003",
  "is_power_on": 0
}
```
| Параметр | Тип | Описание |
|----------|-----|----------|
| `project_cwd` | string | Каталог проекта (идентифицирует проект) |
| `project_name` | string | Имя проекта |
| `project_script` | string | Ключ скрипта из `package.json` (см. [`get_run_list`](#3-get_run_list)) |
| `port` | string | Порт |
| `run_user` | string | Пользователь запуска (`www`) |
| `nodejs_version` | string | Версия Node (см. [`get_nodejs_version`](#4-get_nodejs_version)) |
| `project_ps` | string | Описание / заметка |
| `is_power_on` | int | Автозапуск при загрузке сервера: `1` — да, `0` — нет |

**Реальный ответ:**
```json
{ "status": 0, "message": { "status_code": 1, "error_msg": "", "data": "Modify the project successfully" } }
```

---

## 7. `pre_env`

Метаданные для формы создания проекта. Эндпоинт **отличается** от остальных: `POST /v2/mod/nodejs/com/pre_env` (без `data`, тело пустое).

**Реальный ответ (обезличено):**
```json
{
  "status": 0,
  "message": {
    "nodejs_versions": ["v24.13.0"],
    "package_managers": ["pnpm", "yarn", "npm"],
    "user_list": ["www", "root", "nobody", "..."],
    "maximum_memory": 3819
  }
}
```
| Поле | Что значит |
|------|-----------|
| `nodejs_versions` | установленные версии Node |
| `package_managers` | доступные менеджеры пакетов |
| `user_list` | системные пользователи (для поля «Пользователь запуска») |
| `maximum_memory` | всего RAM сервера, МБ (потолок лимита памяти PM2) |

---

## 8. `create_project`

Создать новый Node-проект. В панели — кнопка **«Добавить элемент»**. Форма имеет **два режима**:

- **«Проект по умолчанию»** — путь указывает на готовый каталог с `package.json`; команда запуска берётся из секции `scripts` (или режим «Пользовательская команда»).
- **«Проект PM2»** — запуск через PM2: файл запуска, каталог запуска, число экземпляров (кластеры), лимит памяти, менеджер пакетов (`pnpm`/`yarn`/`npm`), флаг «не устанавливать node_modules».

> 💡 Поле **«Путь»/«Файл»** заполняется через файловый «проводник» панели, который под капотом ходит в `POST /v2/files?action=GetDir`.

**Параметры (`data`) — режим «Проект по умолчанию», реально снято с живой панели:**
```json
{
  "project_cwd": "/www/node-projects/myapp",
  "project_name": "myapp",
  "project_script": "release",
  "port": "3001",
  "run_user": "www",
  "nodejs_version": "v24.13.0",
  "project_ps": "myapp",
  "domains": ["myapp.example.com:80"],
  "bind_extranet": 1,
  "is_power_on": 1,
  "max_memory_limit": 4096,
  "project_env": ""
}
```
| Параметр | Тип | Описание |
|----------|-----|----------|
| `project_cwd` | string | Каталог проекта (должен содержать `package.json`) |
| `project_name` | string | Имя проекта |
| `project_script` | string | Ключ скрипта из `package.json` (см. [`get_run_list`](#3-get_run_list)) |
| `port` | string | Порт |
| `run_user` | string | Пользователь запуска (`www`) |
| `nodejs_version` | string | Версия Node (см. [`get_nodejs_version`](#4-get_nodejs_version)) |
| `project_ps` | string | Описание / заметка |
| `domains` | array | Домены в формате `"домен:порт"`, напр. `["myapp.example.com:80"]`; пустой массив — без домена |
| `bind_extranet` | int | Привязка внешнего домена: `1` — да, `0` — нет |
| `is_power_on` | int | Автозапуск при загрузке сервера: `1` / `0` |
| `max_memory_limit` | int | Лимит памяти, МБ (потолок — RAM сервера, см. [`pre_env`](#7-pre_env)) |
| `project_env` | string | Переменные окружения (строкой) |

> Отличие от [`modify_project`](#6-modify_project): при создании добавлены `domains`, `bind_extranet`, `max_memory_limit`, `project_env`.

**Ответ:** HTTP 200, `status: 0`. *(В нашем сетевом логе тело ответа уже вытеснилось; проект создаётся успешно — формат успеха по образцу [`modify_project`](#6-modify_project).)*

---

## Примечания

- **`project_script`** в настройках проекта — ключ из секции `scripts` в `package.json` (см. [`get_run_list`](#3-get_run_list)).
- **`nodejs_version`** — одно из значений [`get_nodejs_version`](#4-get_nodejs_version).
- Имена проектов чувствительны к регистру.
- **Удаление** проекта — через [`batch_operation_project`](#5-batch_operation_project) с `operation_type=delete` (отдельного эндпоинта нет; каталог на диске сохраняется).
