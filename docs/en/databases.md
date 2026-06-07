# Databases

[Русская версия](../ru/databases.md) · [⌂ Home](../../README.md)

Managing databases in aaPanel. Read [authentication.md](authentication.md) first (auth: `api_sk` key or session).

> All response examples are **real** (live v8 panel), with values anonymized. `status`: `0` = success, `-1`/`false` = error.

## ⚠️ Key point: each engine has its own API

aaPanel supports several databases (**MySQL, PostgreSQL, MongoDB, Redis, SQLServer**), and they use **different paths and even different body formats**. You can't cover them with one code path — you need a layer per engine.

| Engine | Base path | Body format |
|--------|-----------|-------------|
| **MySQL** | `/v2/data?action=…` and `/v2/database?action=…` | flat fields (`name=...&id=...`) |
| **PostgreSQL** | `/v2/database/pgsql/…` | `data=<URL-encoded JSON>` |
| MongoDB / Redis / SQLServer | `/v2/database/<engine>/…` (presumably) | likely PgSQL-style — capture via recipe |

---

## MySQL

### List — `POST /v2/data?action=getData`
Body: `table=databases&p=1&limit=20&search=` (flat fields).

**Response (one row for brevity):**
```json
{
  "status": 0,
  "message": {
    "where": "type = \"MySQL\"",
    "page": "<div>…Total 1…</div>",
    "data": [
      { "id": 3, "sid": 0, "name": "mydb", "username": "mydb", "password": "<PASSWORD>",
        "accept": "127.0.0.1", "ps": "mydb", "addtime": "2026-06-07 14:17:28",
        "db_type": 0, "quota": { "used": 0, "size": 0 }, "backup_count": 0 }
    ],
    "search_history": []
  }
}
```

### Create — `POST /v2/database?action=AddDatabase`
Body (flat fields):
```
sid=0&name=mydb&codeing=utf8mb4&db_user=mydb&password=<PASSWORD>&dataAccess=127.0.0.1&address=127.0.0.1&active=false&ssl=&ps=mydb&dtype=MySQL
```
| Parameter | Description |
|-----------|-------------|
| `name` / `db_user` | database / user name |
| `password` | password |
| `codeing` | charset (`utf8mb4`) — yes, the API spells it this way (typo) |
| `dataAccess` / `address` | access/address (`127.0.0.1` = local) |
| `ps` | note |
| `dtype` | type (`MySQL`) |

Response: `{"status":0,"message":{"result":"Setup successful!"}}`

### Delete — `POST /v2/database?action=DeleteDatabase`
Body: `name=mydb&id=3`. Response: `{"status":0,"message":{"result":"Deleted successfully"}}`

> ⚠️ In the UI, deleting a MySQL database is guarded by a **two-step confirmation** (manually typing the phrase "Delete database"). The `DeleteDatabase` API endpoint itself deletes immediately.

---

## PostgreSQL

Separate path `/v2/database/pgsql/…`, body is `data=<JSON>`.

### List — `POST /v2/database/pgsql/get_list`
Body: `data={"p":1,"limit":10,"search":"","table":"databases"}`

**Response:**
```json
{
  "status": 0,
  "message": {
    "where": "lower(type) = lower('pgsql')",
    "page": "<div>…Total 1…</div>",
    "data": [
      { "id": 2, "sid": 0, "name": "mydb", "username": "mydb", "password": "<PASSWORD>",
        "accept": "127.0.0.1", "ps": "mydb", "addtime": "2026-01-27 12:48:22",
        "type": "pgsql", "db_type": 0, "backup_count": 0, "listen_ip": "127.0.0.1/32" }
    ]
  }
}
```
Differs from MySQL: has `listen_ip`, type `pgsql`, no `quota`.

### Create — `POST /v2/database/pgsql/AddDatabase`
Body: `data={"sid":0,"name":"mydb","db_user":"mydb","password":"<PASSWORD>","active":false,"ssl":"","ps":"mydb"}`
Response: `{"status":0,"message":{"result":"Add_success"}}`

### Change password — `POST /v2/database/pgsql/ResDatabasePassword`
Body: `data={"id":4,"name":"mydb","password":"<NEW_PASSWORD>"}`
Response: `{"status":0,"message":{"result":"Database password success mydb"}}`

### Delete — `POST /v2/database/pgsql/DeleteDatabase`
Body: `data={"id":4,"name":"mydb"}`
Response: `{"status":0,"message":{"result":"Deleted successfully!"}}`

---

## Database row actions (in the UI)

| Action | MySQL | PostgreSQL |
|--------|-------|------------|
| Import | ✅ | ✅ |
| External tool | phpMyAdmin | Adminer |
| Permissions | ✅ | — |
| Tools | ✅ | — |
| Change password | ✅ | ✅ (`ResDatabasePassword`) |
| Delete | ✅ | ✅ |

> Actions not fully captured yet (import, permissions, tools, backup) can be captured via the "discover → execute" recipe ([authentication.md](authentication.md)). MongoDB/Redis/SQLServer use their own `/v2/database/<engine>/…` paths.
