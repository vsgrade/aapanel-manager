# Authentication

[Русская версия](../ru/authentication.md) · [⌂ Home](../../README.md)

aaPanel offers **two working ways** to call the API. Both were verified against a live panel (v8).

## Which to choose

| | 🔑 `api_sk` key | 🍪 Session |
|--|-----------------|------------|
| For | **apps, automation** | browser discovery, manual probing |
| Lifetime | ♾️ permanent | ⏳ temporary (expires) |
| URL | root, no security entrance | with `/apsess_.../` in the path |
| Coverage | system + Node.js + sites + DB… | everything the panel can do |

> 💡 **Verified:** the `api_sk` key reaches **both** the official (`/system?action=…`) **and** the internal (`/v2/project/nodejs/…`) endpoints. So a single permanent key can manage everything — the right choice for an app.

---

## Method 1 — `api_sk` key (recommended)

### Panel setup
1. **Settings → API** → enable the interface.
2. Generate `api_sk`.
3. Add the **IP of the machine** making the calls to the whitelist.

### URL
```
https://<SERVER>:<PORT>/<endpoint>
```
⚠️ **At the root** — without the security entrance (`/xxxxxxxx`) and without the `apsess` token.

### Request signature
Two fields are added to the POST body:

| Field | Value |
|-------|-------|
| `request_time` | current Unix timestamp |
| `request_token` | `md5( request_time + md5(api_sk) )` |

Pseudocode:
```
request_time  = 1780677549
request_token = md5( "1780677549" + md5(api_sk) )
```

### Example (curl + bash)
```bash
BASE="https://<SERVER>:<PORT>"
SK="<API_SK>"
T=$(date +%s)
SK_MD5=$(printf '%s' "$SK" | md5sum | cut -d' ' -f1)
TOKEN=$(printf '%s' "$T$SK_MD5" | md5sum | cut -d' ' -f1)

# Node.js: list projects
curl -k -X POST "$BASE/v2/project/nodejs/get_project_list" \
  --data-urlencode "request_time=$T" \
  --data-urlencode "request_token=$TOKEN" \
  --data-urlencode 'data={"p":1,"limit":10}'

# System: server resources
curl -k -X POST "$BASE/system?action=GetSystemTotal" \
  --data-urlencode "request_time=$T" \
  --data-urlencode "request_token=$TOKEN"
```

Ready-to-use TypeScript wrapper: [`examples/javascript/aapanel-client.ts`](../../examples/javascript/aapanel-client.ts).

---

## Method 2 — session (for browser discovery)

The same access a logged-in browser has. Handy to **find** the request you need, but unsuitable for an app — the token is temporary.

### URL
```
https://<SERVER>:<PORT>/<SESSION_TOKEN>/<endpoint>
```
`<SESSION_TOKEN>` is the `apsess_...` part from the browser address bar after login.

### Headers
| Header | Source |
|--------|--------|
| `x-http-token` | any panel request (DevTools → Network → Headers) |
| `Cookie` | the browser session cookie |

> ⚠️ Both the token and cookie are **temporary**: they change on re-login and expire over time. Don't hard-code them — use `api_sk` (Method 1) for ongoing work.

---

## 🔍 The "discover → execute" recipe (aaPanel's official approach)

Many panel features aren't officially documented. aaPanel suggests discovering them yourself — and it works:

1. **Discover (browser):** open the panel → `F12` → **Network** tab → click the feature → inspect the request it sends (path + body).
2. **Execute (code):** take the **same path and body**, but at the root and with key auth (`request_time` + `request_token`) instead of the cookie.

| | In the browser (session) | Via the key (API) |
|--|--------------------------|-------------------|
| Path and body | **identical** | **identical** |
| Auth | cookie + `x-http-token` | `request_time` + `request_token` |
| Security entrance in URL | present | **not needed** |

---

## Request body format
`Content-Type: application/x-www-form-urlencoded`.
- **Node.js** endpoints: parameters in a `data=<URL-encoded JSON>` field.
- **System** endpoints: action in the query — `?action=GetSystemTotal`.
- For the key, `request_time` and `request_token` are added to any request.

## SSL: self-signed certificate
The panel typically uses a self-signed certificate: `curl -k`, or disable verification for that host in Node.js. In production, add the panel's trusted CA rather than disabling verification globally.

## Security
- `api_sk`, tokens, and cookies are **secrets**. Keep them in `.env` (see [`.env.example`](../../.env.example)), never in git.
- The `api_sk` key grants **full server access** → keep it server-side only, plus an IP whitelist.
- All requests must be made server-side, not from the user's browser (otherwise CORS, secret leakage, IP whitelist).
