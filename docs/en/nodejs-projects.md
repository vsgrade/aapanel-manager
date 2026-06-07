# Node.js Project Management

[Русская версия](../ru/nodejs-projects.md) · [⌂ Home](../../README.md)

Methods for managing Node.js projects in aaPanel. Read [authentication.md](authentication.md) first (how to authenticate: `api_sk` key or session).

**Base path (via the `api_sk` key, recommended):**
```
POST https://<SERVER>:<PORT>/v2/project/nodejs/<method>
```
Add `request_time` and `request_token` to the body (see [authentication.md](authentication.md)).
Body: `Content-Type: application/x-www-form-urlencoded`. Method parameters go in a `data=<URL-encoded JSON>` field (except `batch_operation_project`, see below).

> All response examples below are **real** (from a live v8 panel), with values anonymized.

## Response convention

The `status` field: **`0`** = success, **`-1`** (or `false`) = error. The payload is in `message`.

## Method list

| # | Method | Purpose |
|---|--------|---------|
| 1 | [`get_project_list`](#1-get_project_list) | Projects + status + CPU/RAM |
| 2 | [`get_project_info`](#2-get_project_info) | Info about one project |
| 3 | [`get_run_list`](#3-get_run_list) | Run scripts from `package.json` |
| 4 | [`get_nodejs_version`](#4-get_nodejs_version) | Available Node.js versions |
| 5 | [`batch_operation_project`](#5-batch_operation_project) | Start / stop / restart |

---

## 1. `get_project_list`

Projects with pagination. **The key method for a dashboard** — returns names, status (running/stopped), and CPU/RAM per project in one call.

**Parameters (`data`):**
```json
{ "p": 1, "limit": 10, "search": "", "re_order": "" }
```
| Parameter | Type | Description |
|-----------|------|-------------|
| `p` | int | Page (from 1) |
| `limit` | int | Items per page |
| `search` | string | Search by name |
| `re_order` | string | Sort order |

**Real response (anonymized, one project for brevity):**
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

**Key fields:**
| Field | Meaning |
|-------|---------|
| `run` | **`true` = running, `false` = stopped** |
| `name` | project name |
| `project_config.port` | port |
| `project_config.nodejs_version` | Node.js version |
| `project_config.domains` | bound domains |
| `load_info.<pid>.cpu_percent` | process CPU usage (%) |
| `load_info.<pid>.memory_used` | process memory, **bytes** |
| `load_info` | empty `{}` if the project is stopped |

---

## 2. `get_project_info`

Info about a single project (same structure, without the `data` array).

**Parameters (`data`):** `{ "project_name": "myapp" }`

**Real response (anonymized):**
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

Run commands from the `scripts` section of `package.json`.

**Parameters (`data`):** `{ "project_cwd": "/www/node-projects/myapp/" }`

**Real response (success):**
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

**Real response (error — path does not exist):**
```json
{ "status": -1, "message": { "status_code": -1, "error_msg": "Project directory does not exist!", "data": "Project directory does not exist!" } }
```

> ⚠️ The path must be UTF-8. URL-encode non-Latin characters in the path correctly.

---

## 4. `get_nodejs_version`

Node.js versions installed in the panel.

**Parameters (`data`):** empty (`data=`).

**Real response:**
```json
{ "status": 0, "message": ["v22.22.0", "v24.13.0"] }
```

---

## 5. `batch_operation_project`

Start / stop / restart one or more projects.

> ⚠️ **Note:** the request format is **different** from the other methods. Parameters are passed **directly** (not inside `data=`), and project names are a JSON array:

**Request body (form-urlencoded):**
```
project_names=["myapp"]&operation_type=start
```
| Parameter | Type | Description |
|-----------|------|-------------|
| `project_names` | JSON array of strings | project names, e.g. `["myapp"]` or `["a","b"]` |
| `operation_type` | string | `start`, `stop`, `restart` |

> ⚠️ `start` is verified live. `stop` / `restart` use the same format, but confirm the exact keyword via the "discover → execute" recipe.

**Example (curl, key auth):**
```bash
curl -k -X POST "https://<SERVER>:<PORT>/v2/project/nodejs/batch_operation_project" \
  --data-urlencode "request_time=$T" --data-urlencode "request_token=$TOKEN" \
  --data-urlencode 'project_names=["myapp"]' \
  --data-urlencode 'operation_type=start'
```

**Real response:**
```json
{
  "status": 0,
  "message": {
    "msg": "Successfully 1 items.Failed on 0 projects.",
    "msg_list": [ { "name": "myapp", "status": true, "msg": "Started successfully" } ]
  }
}
```

---

## Notes

- **`project_script`** in a project's settings is a key from the `scripts` section of `package.json` (see [`get_run_list`](#3-get_run_list)).
- **`nodejs_version`** is one of the values from [`get_nodejs_version`](#4-get_nodejs_version).
- Project names are case-sensitive.
- The project-settings method (`modify_project`) was not verified against a live panel — capture its exact format via the "discover → execute" recipe ([authentication.md](authentication.md)).
