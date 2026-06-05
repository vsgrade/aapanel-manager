# Node.js Project Management

[Русская версия](../ru/nodejs-projects.md) · [⌂ Home](../../README.md)

Methods for managing Node.js projects in aaPanel. Read [authentication.md](authentication.md) first (base URL, token, request format).

**Base path for all methods:**
```
POST https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/<method>
```
**Body:** `Content-Type: application/x-www-form-urlencoded`, field `data=<URL-encoded JSON>`.

## Method list

| # | Method | Purpose |
|---|--------|---------|
| 1 | [`get_project_list`](#1-get_project_list) | List projects |
| 2 | [`get_project_info`](#2-get_project_info) | Project info |
| 3 | [`get_run_list`](#3-get_run_list) | Run scripts from `package.json` |
| 4 | [`get_nodejs_version`](#4-get_nodejs_version) | Available Node.js versions |
| 5 | [`batch_operation_project`](#5-batch_operation_project) | Start / stop / restart |
| 6 | [`modify_project`](#6-modify_project) | Modify project settings |

---

## 1. `get_project_list`

List projects (with pagination and search).

**Request body:**
```json
{ "p": 1, "limit": 10, "search": "", "re_order": "" }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `p` | int | Page number (from 1) |
| `limit` | int | Items per page |
| `search` | string | Search by project name |
| `re_order` | string | Sort order |

**Example:**
```bash
curl -k -X POST "https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/get_project_list" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'data={"p":1,"limit":10,"search":"","re_order":""}'
```

---

## 2. `get_project_info`

Get detailed info about a specific project.

**Request body:**
```json
{ "project_name": "crmtest2" }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_name` | string | Project name |

**Example:**
```bash
curl -k -X POST "https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/get_project_info" \
  --data-urlencode 'data={"project_name":"crmtest2"}'
```

---

## 3. `get_run_list`

Get the list of run commands from the `scripts` section of the project's `package.json` (e.g. `start`, `dev`, `build`).

**Request body:**
```json
{ "project_cwd": "/www/node-projects/myproject/" }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_cwd` | string | Full path to the project folder |

---

## 4. `get_nodejs_version`

Get the list of Node.js versions installed in the panel.

**Request body:** empty (`data=`).

```bash
curl -k -X POST "https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/get_nodejs_version" \
  --data-urlencode 'data='
```

---

## 5. `batch_operation_project`

Start, stop, or restart a project (supports multiple projects at once).

**Request body:**
```json
{ "ids": "crmtest2", "type": "start" }
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `ids` | string | Project name (or several, comma-separated) |
| `type` | string | Operation: `start`, `stop`, `reload` |

**`type` values:**

| Value | Action |
|-------|--------|
| `start` | Start the project |
| `stop` | Stop the project |
| `reload` | Restart the project |

**Examples:**
```bash
# Start
curl -k -X POST "https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/batch_operation_project" \
  --data-urlencode 'data={"ids":"crmtest2","type":"start"}'

# Stop
curl -k -X POST "https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/batch_operation_project" \
  --data-urlencode 'data={"ids":"crmtest2","type":"stop"}'

# Restart
curl -k -X POST "https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/batch_operation_project" \
  --data-urlencode 'data={"ids":"crmtest2","type":"reload"}'
```

---

## 6. `modify_project`

Modify project settings.

**Request body:**
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

| Parameter | Type | Description |
|-----------|------|-------------|
| `project_cwd` | string | Full path to the project folder |
| `project_name` | string | Project name |
| `project_script` | string | Command from `package.json` (`start`, `dev`, etc.) — see [`get_run_list`](#3-get_run_list) |
| `port` | string | Project port |
| `run_user` | string | OS user (`www`, `root`) |
| `nodejs_version` | string | Node.js version (e.g. `v24.13.0`) — see [`get_nodejs_version`](#4-get_nodejs_version) |
| `project_ps` | string | Note / comment |
| `is_power_on` | int | Auto-start with system: `1` — yes, `0` — no |

---

## Notes

- **`project_script`** is a key from the `scripts` section of `package.json` (e.g. `start`, `dev`). Available values for a given project are obtained via [`get_run_list`](#3-get_run_list).
- Project names (`project_name` / `ids`) are case-sensitive.
- The panel's response format may differ between aaPanel versions — verify against your own panel via DevTools.
