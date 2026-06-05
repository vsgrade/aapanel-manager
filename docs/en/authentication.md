# Authentication

[Русская версия](../ru/authentication.md) · [⌂ Home](../../README.md)

The Node.js project methods (`/v2/project/nodejs/...`) work through the panel's **session token** — the same mechanism the web UI uses in the browser.

---

## Base URL

```
https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/<method>
```

| Part | Meaning |
|------|---------|
| `<SERVER>` | IP or domain of the aaPanel server |
| `<PORT>` | panel port (e.g. `41192`) |
| `<SESSION_TOKEN>` | session token `apsess_...` (see below) |

**HTTP method:** `POST` for all requests.

---

## Where to get the session token

1. Log in to aaPanel in your browser.
2. Look at the **address bar**:
   ```
   https://192.168.0.10:41192/apsess_xxxxxxxxEXAMPLExxxxxxxx/...
                              └──────────── this is the token ───────────┘
   ```
3. The `apsess_...` part is your `SESSION_TOKEN`.

> ⚠️ **The token is temporary.** It changes on every new login and expires over time. So you **cannot hard-code it** — for ongoing automation an app must either log in programmatically and refresh the token, or use the official `api_sk` (see [overview.md](overview.md)).

---

## Request body format

All parameters are passed as **URL-encoded JSON** in a `data` field:

```
Content-Type: application/x-www-form-urlencoded

data=<URL-encoded JSON>
```

For example, the JSON `{"p":1,"limit":10}` becomes:

```
data=%7B%22p%22%3A1%2C%22limit%22%3A10%7D
```

With `curl` this is easiest via `--data-urlencode`:

```bash
curl -k -X POST "https://<SERVER>:<PORT>/<SESSION_TOKEN>/v2/project/nodejs/get_project_list" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  --data-urlencode 'data={"p":1,"limit":10,"search":"","re_order":""}'
```

---

## SSL: self-signed certificate

aaPanel typically uses a self-signed certificate, so default SSL verification will fail. For testing:

- `curl` — the `-k` flag;
- Node.js / fetch — disable certificate verification for that host.

> ⚠️ Disabling SSL verification is acceptable for local testing only. In production, configure a trusted certificate for the panel or explicitly add its CA rather than globally disabling verification.

---

## Security

- The session token, and especially `api_sk`, are **secrets**. Never commit them to git; keep them in `.env` (see [`.env.example`](../../.env.example)).
- All requests to the panel must be made **server-side**, not from the user's browser: otherwise secrets leak into client code, plus CORS and the IP whitelist will block it.
