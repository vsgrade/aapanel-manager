# FTP

[Русская версия](../ru/ftp.md) · [⌂ Home](../../README.md)

Managing FTP users in aaPanel (`/v2/ftp` + the shared `/v2/data` list). Read [authentication.md](authentication.md) first.

> Examples are **real** (live v8 panel, Pureftpd), values anonymized. `status`: `0` = success. The `message.result` text is **localized** (follows the panel UI language) — branch on `status`, not on the text.

Auth paths: captured over session (`/<apsess_token>/v2/ftp?action=…`); with `api_sk` call from the panel root (`/v2/ftp?action=…`). See [authentication.md](authentication.md). Bodies are `application/x-www-form-urlencoded`.

## Methods

| Action | Endpoint |
|--------|----------|
| List | `/v2/data?action=getData` (`table=ftps`) |
| Create user | `/v2/ftp?action=AddUser` |
| Change password | `/v2/ftp?action=SetUserPassword` |
| Enable / disable | `/v2/ftp?action=SetStatus` |
| Delete user | `/v2/ftp?action=DeleteUser` |

---

## List — `POST /v2/data?action=getData`

Body: `p=1&limit=10&search=&table=ftps`

**Response:**
```json
{
  "status": 0,
  "message": {
    "where": "",
    "page": "<div>…Total 1…</div>",
    "data": [
      {
        "id": 1, "pid": 0, "name": "ftpuser", "password": "<PASSWORD>",
        "status": "1", "ps": "ftpuser", "addtime": "2026-06-08 08:15:50",
        "path": "/www/wwwroot/ftpuser",
        "quota": { "used": 0, "size": 0, "quota_push": {"size":0,"used":0}, "quota_storage": {"size":0,"used":0} }
      }
    ],
    "search_history": []
  }
}
```
| Field | Meaning |
|-------|---------|
| `id` | FTP user id (used by all other endpoints) |
| `name` | FTP username |
| `password` | password (stored/returned in clear) |
| `status` | `"1"` = active, `"0"` = disabled |
| `path` | home directory |
| `ps` | note |
| `quota` | quota / usage |

---

## Create user — `POST /v2/ftp?action=AddUser`

Body: `ftp_username=ftpuser&ftp_password=<PASSWORD>&path=/www/wwwroot/ftpuser&ps=ftpuser`

| Parameter | Description |
|-----------|-------------|
| `ftp_username` | username |
| `ftp_password` | password |
| `path` | home directory — **created if it doesn't exist** |
| `ps` | note |

Response: `{"status":0,"message":{"result":"Settings applied successfully"}}`

> Creating an FTP user also creates a real system FTP account and the `path` directory. Deleting the user (below) does **not** remove that directory — clean it up separately if needed.

---

## Change password — `POST /v2/ftp?action=SetUserPassword`

Body: `id=1&ftp_username=ftpuser&new_password=<NEW_PASSWORD>`
Response: `{"status":0,"message":{"result":"Settings applied successfully"}}`

## Enable / disable — `POST /v2/ftp?action=SetStatus`

Body: `id=1&status=0&username=ftpuser`

| Parameter | Description |
|-----------|-------------|
| `id` | FTP user id |
| `username` | FTP username |
| `status` | `0` = disable, `1` = enable |

Response: `{"status":0,"message":{"result":"Settings applied successfully"}}`

## Delete user — `POST /v2/ftp?action=DeleteUser`

Body: `id=1&username=ftpuser`
Response: `{"status":0,"message":{"result":"Deleted successfully"}}`

---

## Other actions (capture via the recipe)

The FTP section also has **Set path** (per-row "Set path"), **Change FTP port**, and **FTP log analysis**. Capture these with the discover → execute recipe ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)).
