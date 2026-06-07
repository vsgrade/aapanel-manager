# Базы данных

[English version](../en/databases.md) · [⌂ Главная](../../README.ru.md)

Управление базами данных в aaPanel. Перед чтением — [authentication.md](authentication.md) (авторизация: ключ `api_sk` или сессия).

> Все примеры ответов — **реальные** (живая панель v8), значения обезличены. `status`: `0` — успех, `-1`/`false` — ошибка.

## ⚠️ Главное: у каждого движка — свой API

aaPanel поддерживает несколько СУБД (**MySQL, PostgreSQL, MongoDB, Redis, SQLServer**), и у них **разные пути и даже разный формат тела**. Нельзя покрыть все одним кодом — нужен слой под каждый движок.

| Движок | Базовый путь | Формат тела |
|--------|--------------|-------------|
| **MySQL** | `/v2/data?action=…` и `/v2/database?action=…` | плоские поля (`name=...&id=...`) |
| **PostgreSQL** | `/v2/database/pgsql/…` | `data=<URL-encoded JSON>` |
| MongoDB / Redis / SQLServer | `/v2/database/<движок>/…` (предположительно) | по образцу PgSQL — снять рецептом |

---

## MySQL

### Список — `POST /v2/data?action=getData`
Тело: `table=databases&p=1&limit=20&search=` (плоские поля).

**Ответ (одна строка для примера):**
```json
{
  "status": 0,
  "message": {
    "where": "type = \"MySQL\"",
    "page": "<div>…Total 1…</div>",
    "data": [
      { "id": 3, "sid": 0, "name": "mydb", "username": "mydb", "password": "<ПАРОЛЬ>",
        "accept": "127.0.0.1", "ps": "mydb", "addtime": "2026-06-07 14:17:28",
        "db_type": 0, "quota": { "used": 0, "size": 0 }, "backup_count": 0 }
    ],
    "search_history": []
  }
}
```

### Создать — `POST /v2/database?action=AddDatabase`
Тело (плоские поля):
```
sid=0&name=mydb&codeing=utf8mb4&db_user=mydb&password=<ПАРОЛЬ>&dataAccess=127.0.0.1&address=127.0.0.1&active=false&ssl=&ps=mydb&dtype=MySQL
```
| Параметр | Описание |
|----------|----------|
| `name` / `db_user` | имя БД / пользователя |
| `password` | пароль |
| `codeing` | кодировка (`utf8mb4`) — да, в API так и пишется, с опечаткой |
| `dataAccess` / `address` | доступ/адрес (`127.0.0.1` = локально) |
| `ps` | заметка |
| `dtype` | тип (`MySQL`) |

Ответ: `{"status":0,"message":{"result":"Настройка успешно!"}}`

### Удалить — `POST /v2/database?action=DeleteDatabase`
Тело: `name=mydb&id=3`. Ответ: `{"status":0,"message":{"result":"Успешно удалил"}}`

> ⚠️ В UI удаление MySQL-БД защищено **двухэтапным подтверждением** (ручной ввод фразы «Удалить базу данных»). Сам API-эндпоинт `DeleteDatabase` удаляет сразу.

---

## PostgreSQL

Отдельный путь `/v2/database/pgsql/…`, тело — `data=<JSON>`.

### Список — `POST /v2/database/pgsql/get_list`
Тело: `data={"p":1,"limit":10,"search":"","table":"databases"}`

**Ответ:**
```json
{
  "status": 0,
  "message": {
    "where": "lower(type) = lower('pgsql')",
    "page": "<div>…Total 1…</div>",
    "data": [
      { "id": 2, "sid": 0, "name": "mydb", "username": "mydb", "password": "<ПАРОЛЬ>",
        "accept": "127.0.0.1", "ps": "mydb", "addtime": "2026-01-27 12:48:22",
        "type": "pgsql", "db_type": 0, "backup_count": 0, "listen_ip": "127.0.0.1/32" }
    ]
  }
}
```
Отличие от MySQL: есть `listen_ip`, тип `pgsql`, нет `quota`.

### Создать — `POST /v2/database/pgsql/AddDatabase`
Тело: `data={"sid":0,"name":"mydb","db_user":"mydb","password":"<ПАРОЛЬ>","active":false,"ssl":"","ps":"mydb"}`
Ответ: `{"status":0,"message":{"result":"Add_success"}}`

### Сменить пароль — `POST /v2/database/pgsql/ResDatabasePassword`
Тело: `data={"id":4,"name":"mydb","password":"<НОВЫЙ_ПАРОЛЬ>"}`
Ответ: `{"status":0,"message":{"result":"Успех пароля базы данных mydb"}}`

### Удалить — `POST /v2/database/pgsql/DeleteDatabase`
Тело: `data={"id":4,"name":"mydb"}`
Ответ: `{"status":0,"message":{"result":"Удалить успешно!"}}`

---

## Действия строки БД (в UI)

| Действие | MySQL | PostgreSQL |
|----------|-------|------------|
| Импорт | ✅ | ✅ |
| Внешний инструмент | phpMyAdmin | Adminer |
| Права доступа | ✅ | — |
| Инструменты | ✅ | — |
| Смена пароля | ✅ | ✅ (`ResDatabasePassword`) |
| Удалить | ✅ | ✅ |

> Не до конца снятые действия (импорт, права доступа, инструменты, бэкап) добираются тем же рецептом «разведка → исполнение» ([authentication.md](authentication.md)). MongoDB/Redis/SQLServer — отдельными путями `/v2/database/<движок>/…`.
