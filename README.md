# aaPanel Manager

> Self-hosted dashboard to manage your **aaPanel** servers from one place — backed by the most complete **verified API documentation** for aaPanel (Node.js projects, server monitoring, and more).

🌍 **Language:** **English** · [Русский](README.ru.md)

[![CI](https://github.com/vsgrade/aapanel-manager/actions/workflows/ci.yml/badge.svg)](https://github.com/vsgrade/aapanel-manager/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

![aaPanel Manager — servers dashboard](docs/screenshots/servers.png)

## Why this project

[aaPanel](https://www.aapanel.com/) (the international edition of the BT Panel) is a popular web control panel for Linux servers — but its HTTP API is only partly documented, and running several panels means logging into each one separately. This repository solves both problems:

1. **The app** — a self-hosted Next.js dashboard that manages many aaPanel servers through a secure **backend proxy**. The browser never talks to a panel directly; your `api_sk` secrets stay **encrypted on your own server**.
2. **The docs** — real, **verified** request/response examples for the aaPanel API, including the parts the official docs skip (Node.js project management in particular).

**Key finding:** a single permanent `api_sk` key, used at the panel root, covers **both** the official endpoints (`/system?action=…`) **and** the internal ones (`/v2/project/nodejs/…`) — so one stable key manages everything.

## App features

- 🖥️ **Multi-server** — add / edit / remove aaPanel servers; `api_sk` encrypted at rest (AES-256-GCM)
- 🟢 **Node.js projects** — list, status, info, logs, start / stop / restart, create / modify / delete
- 📊 **Live monitoring** — CPU / RAM / disk with auto-refresh (background worker + Server-Sent Events)
- 👥 **Users & roles** — admin / viewer, user management, self password change
- 🔒 **Secure by design** — backend proxy; secrets never reach the browser; audit log of every change
- 🌐 **i18n & themes** — English / Russian, light / dark

> **Status:** actively developed. Multi-server, Node.js projects, monitoring and user management work today. Databases, files, FTP, cron and firewall are already covered in the API docs and are on the roadmap for the app.

## Screenshots

|  |  |
|---|---|
| **Servers (dark theme)**<br>![Servers — dark](docs/screenshots/servers-dark.png) | **Add a server**<br>![Add server](docs/screenshots/add-server.png) |
| **Users & roles**<br>![Users](docs/screenshots/users.png) | **Versions & updates**<br>![Settings](docs/screenshots/settings.png) |

## Tech stack

Next.js 16 (App Router · React Server Components · Server Actions) · React 19 · TypeScript · Prisma 7 + PostgreSQL · Auth.js v5 · Tailwind v4 · Docker (standalone).

## Quick start (development)

**Requirements:** Node 24, pnpm 11 (`corepack enable`), PostgreSQL.

```bash
git clone https://github.com/vsgrade/aapanel-manager.git
cd aapanel-manager/web
pnpm install
cp .env.example .env          # set DATABASE_URL, AUTH_SECRET, APP_ENCRYPTION_KEY
pnpm prisma migrate deploy
pnpm dev                      # http://localhost:3000
```

For production (Docker images, releasing by tag, self-update) see [docs/RELEASING.md](docs/RELEASING.md).

## API documentation

| Document | Contents |
|----------|----------|
| 📖 [Overview](docs/en/overview.md) | What the aaPanel API is; two auth schemes; the discover→execute recipe |
| 🔑 [Authentication](docs/en/authentication.md) | `api_sk` key (recommended) vs session; request signing; SSL; security |
| 🟢 [Node.js Projects](docs/en/nodejs-projects.md) | list, info, scripts, versions, start/stop — with real responses |
| 🌐 [Websites (PHP/WP)](docs/en/sites.md) | list, create, delete sites |
| 🗄️ [Databases](docs/en/databases.md) | MySQL + PostgreSQL CRUD (each engine has its own API) |
| 📁 [Files (File Manager)](docs/en/files.md) | list/create/edit/move/copy/permissions/archive/upload/remote-download/delete + recycle bin |
| 📂 [FTP](docs/en/ftp.md) | FTP users: list, create, change password, enable/disable, delete |
| ⏱️ [Cron (Scheduler)](docs/en/cron.md) | tasks: list, create, run now, logs, enable/disable, delete |
| 🛡️ [Firewall (Security)](docs/en/firewall.md) | read firewall state: status, summary, port rules (writes via recipe) |
| 📊 [Server Monitoring](docs/en/system-monitoring.md) | CPU / RAM / disk (`GetSystemTotal`, `GetDiskInfo`) |

## Code example

A ready-to-use TypeScript wrapper (api_sk **or** session auth): [`examples/javascript/aapanel-client.ts`](examples/javascript/aapanel-client.ts).

```ts
import { AaPanelClient } from "./examples/javascript/aapanel-client";

const client = new AaPanelClient({
  baseUrl: process.env.AAPANEL_BASE_URL!,                  // https://<server>:<port> (root!)
  auth: { mode: "apiKey", apiSk: process.env.AAPANEL_API_SK! },
  insecureTLS: true,                                       // self-signed cert
});

await client.listProjects();        // names, status (running/stopped), CPU/RAM
await client.getSystemTotal();      // server CPU / RAM / cores
await client.startProject("myapp");
```

> ⚠️ **Server-side only.** `api_sk` grants full server access — never expose it in browser code. See [Authentication → Security](docs/en/authentication.md#security).

## The recipe (aaPanel's official approach)

Undocumented feature? Open the panel → DevTools (Network) → click it → inspect the request → replay the **same path and body** with `api_sk` auth. See [Authentication](docs/en/authentication.md#-the-discover--execute-recipe-aapanels-official-approach).

## Roadmap

**API documentation**

- [x] Node.js project management (create, list, info, scripts, versions, start/stop/restart, modify, delete)
- [x] Websites (PHP/WP): list, create, delete
- [x] Databases (MySQL + PostgreSQL CRUD)
- [x] Files / File Manager (CRUD, permissions, archive, upload, remote download, recycle bin)
- [x] FTP users (CRUD, password, enable/disable)
- [x] Cron / Task Scheduler (CRUD, run now, logs, enable/disable)
- [x] Firewall (read state: status, summary, port rules — writes via recipe)
- [x] Server monitoring (CPU/RAM/disk)
- [x] Verified `api_sk` covers internal endpoints too
- [ ] More modules (SSL, domains, backups)

**App**

- [x] Multi-server management (encrypted `api_sk`, test connection, audit log)
- [x] Node.js projects (CRUD + control + logs)
- [x] Live monitoring (background worker + SSE)
- [x] Users & roles, authentication
- [x] Version display + update settings
- [ ] Databases / Files / FTP / Cron / Firewall sections in the app
- [ ] Update / rollback actions

## Disclaimer

Unofficial documentation. Verified on aaPanel v8; behavior may change between versions — verify against your own panel. Official docs: [aapanel.com/docs](https://www.aapanel.com/docs/).

## License

[MIT](LICENSE)
