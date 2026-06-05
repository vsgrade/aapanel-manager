# Управление Node.js-проектами

[English version](../en/nodejs-projects.md) · [⌂ Главная](../../README.ru.md)

Методы для управления Node.js-проектами в aaPanel. Перед чтением — [authentication.md](authentication.md) (базовый URL, токен, формат запросов).

**Базовый путь всех методов:**
```
POST https://<СЕРВЕР>:<ПОРТ>/<SESSION_TOKEN>/v2/project/nodejs/<метод>
```
**Тело:** `Content-Type: application/x-www-form-urlencoded`, поле `data=<URL-encoded JSON>`.

## Список методов

| # | Метод | Назначение |
|---|-------|-----------|
| 1 | [`get_project_list`](#1-get_project_list) | Список проектов |
| 2 | [`get_project_info`](#2-get_project_info) | Информация о проекте |
| 3 | [`get_run_list`](#3-get_run_list) | Команды запуска из `package.json` |
| 4 | [`get_nodejs_version`](#4-get_nodejs_version) | Доступные версии Node.js |
| 5 | [`batch_operation_project`](#5-batch_operation_project) | Старт / стоп / рестарт |
| 6 | [`modify_project`](#6-modify_project) | Изменить настройки проекта |

---

## 1. `get_project_list`

Получить список проектов (с пагинацией и поиском).

**Тело запроса:**
```json
{ "p": 1, "limit": 10, "search": "", "re_order": "" }
```

| Параметр | Тип | Описание |
|----------|-----|----------|
| `p` | int | Номер страницы (с 1) |
| `limit` | int | Количество на странице |
| `search` | string | Поиск по имени проекта |
| `re_order` | string | Порядок сортировки |

**Пример:**
```bash
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/<SESSION_TOKEN>/v2/project/nodejs/get_project_list" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'data={"p":1,"limit":10,"search":"","re_order":""}'
```

---

## 2. `get_project_info`

Получить подробную информацию о конкретном проекте.

**Тело запроса:**
```json
{ "project_name": "crmtest2" }
```

| Параметр | Тип | Описание |
|----------|-----|----------|
| `project_name` | string | Имя проекта |

**Пример:**
```bash
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/<SESSION_TOKEN>/v2/project/nodejs/get_project_info" \
  --data-urlencode 'data={"project_name":"crmtest2"}'
```

---

## 3. `get_run_list`

Получить список команд запуска из секции `scripts` файла `package.json` проекта (например `start`, `dev`, `build`).

**Тело запроса:**
```json
{ "project_cwd": "/www/node-projects/myproject/" }
```

| Параметр | Тип | Описание |
|----------|-----|----------|
| `project_cwd` | string | Полный путь к папке проекта |

---

## 4. `get_nodejs_version`

Получить список установленных в панели версий Node.js.

**Тело запроса:** пустое (`data=`).

```bash
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/<SESSION_TOKEN>/v2/project/nodejs/get_nodejs_version" \
  --data-urlencode 'data='
```

---

## 5. `batch_operation_project`

Запуск, остановка или перезапуск проекта (поддерживает несколько проектов сразу).

**Тело запроса:**
```json
{ "ids": "crmtest2", "type": "start" }
```

| Параметр | Тип | Описание |
|----------|-----|----------|
| `ids` | string | Имя проекта (или несколько через запятую) |
| `type` | string | Операция: `start`, `stop`, `reload` |

**Значения `type`:**

| Значение | Действие |
|----------|----------|
| `start` | Запустить проект |
| `stop` | Остановить проект |
| `reload` | Перезапустить проект |

**Примеры:**
```bash
# Запустить
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/<SESSION_TOKEN>/v2/project/nodejs/batch_operation_project" \
  --data-urlencode 'data={"ids":"crmtest2","type":"start"}'

# Остановить
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/<SESSION_TOKEN>/v2/project/nodejs/batch_operation_project" \
  --data-urlencode 'data={"ids":"crmtest2","type":"stop"}'

# Перезапустить
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/<SESSION_TOKEN>/v2/project/nodejs/batch_operation_project" \
  --data-urlencode 'data={"ids":"crmtest2","type":"reload"}'
```

---

## 6. `modify_project`

Изменить настройки проекта.

**Тело запроса:**
```json
{
  "project_cwd": "/www/node-projects/crmtest2/",
  "project_name": "crmtest2",
  "project_script": "start",
  "port": "3002",
  "run_user": "www",
  "nodejs_version": "v24.13.0",
  "project_ps": "crmtest2",
  "is_power_on": 1
}
```

| Параметр | Тип | Описание |
|----------|-----|----------|
| `project_cwd` | string | Полный путь к папке проекта |
| `project_name` | string | Имя проекта |
| `project_script` | string | Команда из `package.json` (`start`, `dev` и т.д.) — см. [`get_run_list`](#3-get_run_list) |
| `port` | string | Порт проекта |
| `run_user` | string | Пользователь ОС (`www`, `root`) |
| `nodejs_version` | string | Версия Node.js (например `v24.13.0`) — см. [`get_nodejs_version`](#4-get_nodejs_version) |
| `project_ps` | string | Примечание / заметка |
| `is_power_on` | int | Автозапуск с системой: `1` — да, `0` — нет |

---

## Примечания

- **`project_script`** — это ключ из секции `scripts` в `package.json` (например `start`, `dev`). Доступные значения для конкретного проекта получают через [`get_run_list`](#3-get_run_list).
- Имена проектов (`project_name` / `ids`) чувствительны к регистру.
- Формат ответа панели может отличаться между версиями aaPanel — сверяйтесь со своей панелью через DevTools.
