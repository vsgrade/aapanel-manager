# aaPanel API Docs — Node.js Project Management

> Unofficial, community documentation for managing **Node.js projects** via the aaPanel API — an area the official docs barely cover.

🌍 **Language:** **English** · [Русский](README.ru.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What is this?

[aaPanel](https://www.aapanel.com/) (the international edition of the BT/宝塔 panel) is a web control panel for Linux servers. It can be automated through an HTTP API, but the official documentation is incomplete — Node.js project management, in particular, is not documented. This repository fills that gap.

The methods here were obtained the way aaPanel itself recommends for undocumented features: by inspecting the panel's own requests in the browser DevTools.

## Documentation

| Document | Contents |
|----------|----------|
| 📖 [Overview](docs/en/overview.md) | What the aaPanel API is; the two auth schemes (official `api_sk` vs internal session token) |
| 🔑 [Authentication](docs/en/authentication.md) | Session token, request format, SSL caveat, security |
| 🟢 [Node.js Projects](docs/en/nodejs-projects.md) | The 6 methods: list, info, run scripts, versions, start/stop/restart, settings |

## Code example

A ready-to-use TypeScript wrapper: [`examples/javascript/aapanel-client.ts`](examples/javascript/aapanel-client.ts).

```ts
import { AaPanelNodeClient } from "./examples/javascript/aapanel-client";

const client = new AaPanelNodeClient({
  baseUrl: process.env.AAPANEL_BASE_URL!,        // https://<server>:<port>
  sessionToken: process.env.AAPANEL_SESSION_TOKEN!, // apsess_...
});

await client.listProjects();
await client.startProject("crmtest2");
```

> ⚠️ **Run server-side only.** The session token and `api_sk` are secrets — never expose them in browser code. See [Authentication → Security](docs/en/authentication.md#security).

## Quick start (curl)

```bash
curl -k -X POST "https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/get_project_list" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'data={"p":1,"limit":10,"search":"","re_order":""}'
```

## Roadmap

- [x] Node.js project management
- [ ] Websites, databases, FTP, SSL, backups (official `api_sk` API)
- [ ] Next.js management app on top of this API (backend proxy)

## Disclaimer

Unofficial documentation. Behavior may change with aaPanel updates — verify against your own panel. Official docs: [aapanel.com/docs](https://www.aapanel.com/docs/).

## License

[MIT](LICENSE)
