# aaPanel API Overview

[Русская версия](../ru/overview.md) · [⌂ Home](../../README.md)

aaPanel (the international edition of the BT Panel) is a web control panel for Linux servers: sites, databases, FTP, SSL, firewall, backups, Node.js projects, and more. Almost all of it can be automated via an HTTP API.

This repository documents **Node.js project management** and **server monitoring**, focusing on what is poorly documented officially but verified against a live panel (v8).

---

## Two ways to access

### 1. The `api_sk` key (recommended for apps)

- Enable: **Settings → API** → generate the key → add the IP to the whitelist.
- Signature: `request_token = md5( request_time + md5(api_sk) )`.
- The **key is permanent** — it doesn't expire.
- ✅ **Verified:** it works at the root (no security entrance) and covers **both** the official endpoints (`/system?action=…`) **and** the internal ones (`/v2/project/nodejs/…`). One key for both the server and Node.js projects.

### 2. Session (for browser discovery)

- The same access a logged-in browser has: an `apsess_...` token in the URL + `x-http-token` + cookie.
- ⏳ Temporary (expires) — unsuitable for an app, but handy to **find** the request you need.

Details of both methods — [authentication.md](authentication.md).

---

## 🔍 The "discover → execute" recipe

aaPanel's official advice for undocumented features: open the panel in a browser → DevTools (Network) → click a button → inspect the request → replay it in code. We verified this: the **same path and body** work via the permanent `api_sk` key (only the auth differs). See [authentication.md](authentication.md).

---

## What this repository documents

| Document | Contents |
|----------|----------|
| [authentication.md](authentication.md) | Two auth schemes (`api_sk` + session), the recipe, SSL, security |
| [nodejs-projects.md](nodejs-projects.md) | Node.js: list/info/scripts/versions/start-stop + real responses |
| [system-monitoring.md](system-monitoring.md) | Server: CPU/RAM/disk (`GetSystemTotal`, `GetDiskInfo`) |

TypeScript wrapper example: [`examples/javascript/aapanel-client.ts`](../../examples/javascript/aapanel-client.ts).

---

## Disclaimer

Unofficial community documentation. Some endpoints were obtained by observing the panel's requests and verified on a specific version (aaPanel v8). Behavior may change between versions — verify against your own panel. Official docs — [aapanel.com/docs](https://www.aapanel.com/docs/).
