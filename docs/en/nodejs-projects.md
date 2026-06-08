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
| 5 | [`batch_operation_project`](#5-batch_operation_project) | Start / stop / restart / **delete** |
| 6 | [`modify_project`](#6-modify_project) | Modify project settings |
| 7 | [`pre_env`](#7-pre_env) | Metadata for the create form (Node versions, package managers, users) |
| 8 | [`create_project`](#8-create_project) | Create a new project |
| 9 | [Domain management](#9-domain-management) | List / add / remove a project domain |
| 10 | [Logs](#10-logs) | Project log (PM2/build) and site log (nginx) |
| 11 | [Modules](#11-modules) | List modules + one-click dependency install |
| 12 | [SSL](#12-ssl) | SSL status + Let's Encrypt issuance |

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
| `operation_type` | string | `start`, `stop`, `restart`, **`delete`** |

> ✅ **All four** are verified live: `start`, `stop`, `restart`, `delete` (identical body format). In the UI "Resume project" = `restart`, "Stop project" = `stop`, "Start project" = `start`, "Delete site" = `delete`.
> **Important:** deleting a Node project goes through **this same** method (`operation_type=delete`) — there is no separate endpoint. Only the project's registration in the panel is removed — **the project directory on disk stays** (the delete dialog offers no "delete directory" option, unlike websites).

**Delete — request body:**
```
project_names=["myapp"]&operation_type=delete
```
**Real response (delete):**
```json
{
  "status": 0,
  "message": {
    "msg": "Successfully 1 items.Failed on 0 projects.",
    "msg_list": [ { "name": "myapp", "status": true, "msg": "Operation successful." } ]
  }
}
```

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

## 6. `modify_project`

Modify an existing project's settings (name, port, run script, Node version, description, autostart). Opening the "Edit" form in the panel first loads data via [`get_project_info`](#2-get_project_info) + [`get_run_list`](#3-get_run_list) + [`get_nodejs_version`](#4-get_nodejs_version); saving sends `modify_project`.

**Parameters (`data`):**
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
| Parameter | Type | Description |
|-----------|------|-------------|
| `project_cwd` | string | Project directory (identifies the project) |
| `project_name` | string | Project name |
| `project_script` | string | Script key from `package.json` (see [`get_run_list`](#3-get_run_list)) |
| `port` | string | Port |
| `run_user` | string | Run user (`www`) |
| `nodejs_version` | string | Node version (see [`get_nodejs_version`](#4-get_nodejs_version)) |
| `project_ps` | string | Description / note |
| `is_power_on` | int | Autostart on server boot: `1` = yes, `0` = no |

**Real response:**
```json
{ "status": 0, "message": { "status_code": 1, "error_msg": "", "data": "Modify the project successfully" } }
```

---

## 7. `pre_env`

Metadata for the create-project form. The endpoint is **different** from the others: `POST /v2/mod/nodejs/com/pre_env` (no `data`, empty body).

**Real response (anonymized):**
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
| Field | Meaning |
|-------|---------|
| `nodejs_versions` | installed Node versions |
| `package_managers` | available package managers |
| `user_list` | system users (for the "Run user" field) |
| `maximum_memory` | total server RAM, MB (cap for the PM2 memory limit) |

---

## 8. `create_project`

Create a new Node project. In the panel this is the **"Add project"** button. The form has **two modes**:

- **"Default project"** — the path points to a ready directory with a `package.json`; the run command is taken from its `scripts` section (or "Custom command" mode).
- **"PM2 project"** — runs under PM2: startup file, startup directory, instances (clusters), memory limit, package manager (`pnpm`/`yarn`/`npm`), a "don't install node_modules" flag.

> 💡 The **"Path"/"File"** field is filled via the panel's file browser, which under the hood calls `POST /v2/files?action=GetDir`.

**Parameters (`data`) — "Default project" mode, captured live:**
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
| Parameter | Type | Description |
|-----------|------|-------------|
| `project_cwd` | string | Project directory (must contain `package.json`) |
| `project_name` | string | Project name |
| `project_script` | string | Script key from `package.json` (see [`get_run_list`](#3-get_run_list)) |
| `port` | string | Port |
| `run_user` | string | Run user (`www`) |
| `nodejs_version` | string | Node version (see [`get_nodejs_version`](#4-get_nodejs_version)) |
| `project_ps` | string | Description / note |
| `domains` | array | Domains as `"domain:port"`, e.g. `["myapp.example.com:80"]`; empty array = no domain |
| `bind_extranet` | int | Bind an external domain: `1` = yes, `0` = no |
| `is_power_on` | int | Autostart on server boot: `1` / `0` |
| `max_memory_limit` | int | Memory limit, MB (capped at server RAM, see [`pre_env`](#7-pre_env)) |
| `project_env` | string | Environment variables (as a string) |

> Difference from [`modify_project`](#6-modify_project): creation adds `domains`, `bind_extranet`, `max_memory_limit`, `project_env`.

**Response:** HTTP 200, `status: 0`. *(In our network log the response body had already been evicted; the project is created successfully — the success shape mirrors [`modify_project`](#6-modify_project).)*

---

## 9. Domain management

Project domains (the "Domain management" tab in the "Edit" window) use **separate** endpoints, not part of `modify_project`. All three captured live.

**List — `POST /v2/project/nodejs/project_get_domain`**
Body: `data={"project_name":"myapp"}`
```json
{ "status": 0, "message": [ { "id": 4, "pid": 4, "name": "myapp.example.com", "port": 80, "addtime": "2026-06-08 02:56:11" } ] }
```

**Add — `POST /v2/project/nodejs/project_add_domain`**
Body: `data={"project_name":"myapp","domains":["myapp.example.com"]}` *(the `domains` field is an **array** — multiple allowed)*
```json
{ "status": 0, "message": { "status_code": 1, "error_msg": "[]", "data": "[1] domain names added successfully, [0] failed!" } }
```

**Remove — `POST /v2/project/nodejs/project_remove_domain`**
Body: `data={"project_name":"myapp","domain":"myapp.example.com"}` *(the `domain` field is a **single string**)*
```json
{ "status": 0, "message": { "status_code": 1, "error_msg": "", "data": "Domain name deleted successfully" } }
```

> ⚠️ Note the asymmetry: add takes an **array** `domains`, remove takes a **string** `domain`.

---

## 10. Logs

The "Project log" and "Site log" tabs in the "Edit" window. Both captured live; the response is the log text in `message.result`.

**Project log (PM2 / build output) — `POST /v2/project/nodejs/get_project_log`**
Body: `data={"project_name":"myapp"}`
```json
{ "status": 0, "message": { "result": "<log text: PM2 run/build output>" } }
```

**Site log (nginx access/error) — `POST /v2/site?action=GetSiteLogs`**
> ⚠️ This is the **generic** site endpoint (`/v2/site`), not Node-specific. The parameter is a **flat** `siteName` field, not wrapped in `data=`.
Body: `siteName=myapp`
```json
{ "status": 0, "message": { "result": "<nginx log text>" } }
```

> ⚠️ Log responses are **large** and contain real data (IPs, domains, paths) — anonymize when documenting/logging.

---

## 11. Modules

The "Module" tab in the "Edit" window — the project's npm dependencies.

**List modules — `POST /v2/project/nodejs/get_project_modules`**
Body: `data={"project_name":"myapp","project_cwd":"/www/node-projects/myapp"}`
```json
{ "status": 0, "message": [ /* installed modules; [] if not installed yet */ ] }
```

**One-click dependency install — `POST /v2/project/nodejs/install_packages`**
> The "1-click install" button installs **all** dependencies from the project's `package.json` (`npm/pnpm/yarn install`).
Body: `data={"project_name":"myapp"}`
*(long-running — the install runs in the background; check status via `get_project_modules`)*

---

## 12. SSL

The "SSL" tab in the "Edit" window. Sub-tabs: **Current Certs, Commercial certificate, Let's Encrypt, Certificate owner**.

**SSL status — `POST /v2/site?action=GetSSL`**
> ⚠️ Generic site endpoint (`/v2/site`), flat `siteName` field.
Body: `siteName=myapp`
```json
{ "status": 0, "message": {
  "status": false, "domain": [{"name": "myapp.example.com"}],
  "auth_type": "http", "auto_renew": -1,
  "tls_versions": {"TLSv1": false, "TLSv1.1": true, "TLSv1.2": true, "TLSv1.3": false},
  "email": "<EMAIL>", "cert_data": null
} }
```
(`status:false` — no certificate installed.)

**Let's Encrypt domain check — `POST /v2/ssl_domain?action=check_domain_automatic`**
> Before issuing, the panel checks whether the domain can be validated. Flat `domain` field.
Body: `domain=myapp.example.com`
```json
{ "status": 0, "message": { "hash": "", "domain": "myapp.example.com", "support": [] } }
```
| Field | Meaning |
|-------|---------|
| `support` | available validation methods; **empty array = the domain fails** (no A-record to the server) → issuance won't proceed |

> ⚠️ **The actual Let's Encrypt issue request was not captured:** on the test server the domain has no A-record, so `check_domain_automatic` returned an empty `support` and the panel never reaches the issue request. To capture issuance you need a domain whose A-record points to the server IP; the main issue request then fires after a successful check (capture via the "discover → execute" recipe).

> 🔧 The remaining "Edit" window tabs (**Mapping, URL Rewrite, Configuration, Load, Service status**) fire no GET on open — they render from [`get_project_info`](#2-get_project_info); their endpoints appear on an action (save a rule, etc.).

---

## Notes

- **`project_script`** in a project's settings is a key from the `scripts` section of `package.json` (see [`get_run_list`](#3-get_run_list)).
- **`nodejs_version`** is one of the values from [`get_nodejs_version`](#4-get_nodejs_version).
- Project names are case-sensitive.
- **Changing the port** is done via [`modify_project`](#6-modify_project) (the `port` field); there is no separate method.
- **Deleting** a project uses [`batch_operation_project`](#5-batch_operation_project) with `operation_type=delete` (no separate endpoint; the on-disk directory is preserved).
- **Domains** use the separate [`project_*_domain`](#9-domain-management) methods, not `modify_project`.
