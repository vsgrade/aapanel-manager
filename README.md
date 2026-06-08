# aaPanel API Docs — Node.js Projects & Server Monitoring

> Unofficial, community documentation for the aaPanel API — **Node.js project management** and **server monitoring** — verified against a live panel (v8).

🌍 **Language:** **English** · [Русский](README.ru.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What is this?

[aaPanel](https://www.aapanel.com/) (the international edition of the BT/宝塔 panel) is a web control panel for Linux servers. It can be automated through an HTTP API, but the official documentation is incomplete — Node.js project management, in particular, is not documented. This repository fills that gap with **real, verified** request/response examples.

**Key finding:** a single permanent `api_sk` key, used at the panel root, covers **both** the official endpoints (`/system?action=…`) **and** the internal ones (`/v2/project/nodejs/…`) — so an app can manage everything with one stable key.

## Documentation

| Document | Contents |
|----------|----------|
| 📖 [Overview](docs/en/overview.md) | What the aaPanel API is; two auth schemes; the discover→execute recipe |
| 🔑 [Authentication](docs/en/authentication.md) | `api_sk` key (recommended) vs session; request signing; SSL; security |
| 🟢 [Node.js Projects](docs/en/nodejs-projects.md) | list, info, scripts, versions, start/stop — with real responses |
| 🌐 [Websites (PHP/WP)](docs/en/sites.md) | list, create, delete sites |
| 🗄️ [Databases](docs/en/databases.md) | MySQL + PostgreSQL CRUD (each engine has its own API) |
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

- [x] Node.js project management (create, list, info, scripts, versions, start/stop/restart, modify, delete)
- [x] Websites (PHP/WP): list, create, delete
- [x] Databases (MySQL + PostgreSQL CRUD)
- [x] Server monitoring (CPU/RAM/disk)
- [x] Verified `api_sk` covers internal endpoints too
- [ ] More modules (FTP, SSL, cron, backups)
- [ ] Next.js management app on top of this API (backend proxy, `api_sk`)

## Disclaimer

Unofficial documentation. Verified on aaPanel v8; behavior may change between versions — verify against your own panel. Official docs: [aapanel.com/docs](https://www.aapanel.com/docs/).

## License

[MIT](LICENSE)
