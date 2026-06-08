# Cron (Task Scheduler)

[Русская версия](../ru/cron.md) · [⌂ Home](../../README.md)

Managing scheduled tasks in aaPanel (`/v2/crontab`). Read [authentication.md](authentication.md) first.

> Examples are **real** (live v8 panel), values anonymized. `status`: `0` = success. The `message.result` text is **localized** (some results are stable tokens like `Add_success` / `Del_success`; others follow the UI language) — branch on `status`.

Auth paths: captured over session (`/<apsess_token>/v2/crontab?action=…`); with `api_sk` call from the panel root. See [authentication.md](authentication.md). Bodies are `application/x-www-form-urlencoded`.

## Methods

| Action | Endpoint |
|--------|----------|
| List tasks | `/v2/crontab?action=GetCrontab` |
| Task type groups | `/v2/crontab?action=get_crontab_types` |
| Create task | `/v2/crontab?action=AddCrontab` |
| Run now | `/v2/crontab?action=StartTask` |
| Get run log | `/v2/crontab?action=GetLogs` |
| Enable / disable | `/v2/crontab?action=set_cron_status` |
| Delete task | `/v2/crontab?action=DelCrontab` |

---

## List tasks — `POST /v2/crontab?action=GetCrontab`

Body: `search=&type_id=&order_param=` (all empty = all tasks).

**Response (one task):**
```json
{
  "status": 0,
  "message": [
    {
      "id": 1, "name": "mytask", "type": "day",
      "where1": "1", "where_hour": 1, "where_minute": 30,
      "echo": "f20d8e16a8cfc62631535790e1225430",
      "status": 1, "sType": "toShell", "sName": "ALL",
      "sBody": "echo hello", "user": "root",
      "type_zh": "Per Day", "cycle": "Once a day at 1:30",
      "type_id": 0, "rname": "mytask", "sort": 0,
      "save": "", "backupTo": "", "save_local": 0,
      "notice": 0, "db_type": "mysql", "db_backup_path": "/www/backup"
    }
  ]
}
```
| Field | Meaning |
|-------|---------|
| `id` | task id (used by run/log/status/delete) |
| `name` | task name |
| `type` | schedule type (`day`, `hour`, `minute`, `week`, `month`, `minute-n`, `hour-n`) |
| `where1` / `where_hour` / `where_minute` | schedule values (interval / hour / minute) |
| `sType` | task kind — `toShell` (shell script), site/database backup, log cut, URL access, … |
| `sBody` | shell script body (for `toShell`) |
| `status` | `1` = active, `0` = stopped |
| `echo` | internal task token |
| `cycle` | human-readable schedule |

`get_crontab_types` (no body) returns the list of custom task-type groups (`[]` if none).

---

## Create task — `POST /v2/crontab?action=AddCrontab`

Body (shell-script task, daily at 01:30):
```
name=mytask&type=day&where1=1&week=1&hour=1&minute=30&second=&user=root&sName=ALL&sBody=echo+hello&sType=toShell&save=&backupTo=&urladdress=http://&save_local=0&notice=0&notice_channel=&db_type=mysql&split_type=&split_value=3&flock=1&timeSet=1&db_backup_path=/www/backup&timeType=sday&special_time=&log_cut_path=/www/wwwlogs/history_backups&user_agent=&version=&table_list=&zip_password=
```
Core parameters:

| Parameter | Description |
|-----------|-------------|
| `name` | task name |
| `type` | schedule: `day`, `hour`, `minute`, `week`, `month`, `minute-n`, `hour-n` |
| `where1` | interval N (e.g. every N minutes/hours) |
| `week` | day of week (for `type=week`) |
| `hour` / `minute` / `second` | time of day |
| `user` | execution user (`root`, …) |
| `sType` | task kind: `toShell` (shell), site/db backup, log cut, URL access |
| `sBody` | shell script (for `toShell`) |
| `sName` | target (`ALL` for shell; a site/db name for backups) |
| `notice` / `notice_channel` | send notification on run |

Backup/log-cut tasks also use `save`, `backupTo`, `save_local`, `db_type`, `split_type`, `split_value`, `db_backup_path`, `log_cut_path`, `zip_password`.

Response: `{"status":0,"message":{"result":"Add_success","id":1}}` — the new task `id` is returned.

> Only the **shell-script daily** shape was captured live; other `type`/`sType` combinations (backups, log cut, URL access, N-minute intervals) reuse the same endpoint — capture their exact field values via the recipe.

---

## Run now — `POST /v2/crontab?action=StartTask`
Body: `id=1`
Response: `{"status":0,"message":{"result":"Crontab_task_exec"}}` (runs immediately, may take a while)

## Get run log — `POST /v2/crontab?action=GetLogs`
Body: `id=1`
Response: `{"status":0,"message":{"result":"<task output>\n----…"}}` — the last run's stdout.

## Enable / disable — `POST /v2/crontab?action=set_cron_status`
Body: `id=1&if_stop=false`

| Parameter | Description |
|-----------|-------------|
| `id` | task id |
| `if_stop` | `true` = also kill the task if it is currently running; `false` = just toggle |

Response: `{"status":0,"message":{"result":"Settings applied successfully"}}`

## Delete task — `POST /v2/crontab?action=DelCrontab`
Body: `id=1`
Response: `{"status":0,"message":{"result":"Del_success"}}`

---

## Other actions (capture via the recipe)

Editing a task (the "Edit" button reopens the same form → likely `ModifyCrontab`), the script library, and clearing logs can be captured with the discover → execute recipe ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)).
