# aaPanel API Overview

[Русская версия](../ru/overview.md) · [⌂ Home](../../README.md)

aaPanel (the international edition of the BT/宝塔 panel) is a web control panel for Linux servers: websites, databases, FTP, SSL, firewall, backups, and more. Almost all of it can be automated through an HTTP API without opening the web UI.

This repository documents **Node.js project management** through the API — an area that the official documentation barely covers.

---

## Two ways to access the API

aaPanel effectively exposes **two different ways** to talk to the server, and it's important not to mix them up.

### 1. Official API (permanent `api_sk` key)

- Enabled in the panel: **Settings → API**, where you generate the `api_sk` key and configure the IP whitelist.
- Per-request signature authentication:
  `request_token = md5( request_time + md5(api_sk) )`
- The **key is permanent** — it doesn't change, which is ideal for automation.
- ⚠️ **It does not cover every feature.** The official docs ([api-list](https://www.aapanel.com/docs/api/api-list.html), [PDF](https://www.aapanel.com/Document/api.pdf)) mostly describe the "classics": system, sites, databases, FTP, SSL, cron, firewall, DNS. Node.js project management is not documented there.

### 2. Internal panel interface (session token)

- This is the same API the panel's own web UI uses in the browser.
- The URL contains a **session token** `apsess_...` — a temporary "pass" the panel issues to the browser after login.
- It exposes **everything** the panel can do, including `/v2/project/nodejs/...`.
- ⚠️ The token is **temporary**: it changes on re-login and expires over time. See [authentication.md](authentication.md).

> 💡 **aaPanel's official stance:** anything not covered by the docs is meant to be discovered yourself — open the browser DevTools (Network tab), perform the action in the panel, and inspect the request it sends. The methods in this repository were obtained exactly this way.

---

## What this repository documents

| Document | Contents |
|----------|----------|
| [authentication.md](authentication.md) | How to authenticate: session token, request format, the SSL caveat |
| [nodejs-projects.md](nodejs-projects.md) | Node.js project methods (list, info, start/stop/restart, settings) |

TypeScript wrapper example: [`examples/javascript/aapanel-client.ts`](../../examples/javascript/aapanel-client.ts).

---

## Disclaimer

This is **unofficial**, community documentation. The Node.js projects section is based on observing the panel's real requests and may change with aaPanel updates. Verify behavior against your own panel version. Official docs live at [aapanel.com/docs](https://www.aapanel.com/docs/).
