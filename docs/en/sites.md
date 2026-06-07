# Websites (PHP/WP)

[Русская версия](../ru/sites.md) · [⌂ Home](../../README.md)

Managing websites (PHP/WP) in aaPanel. Read [authentication.md](authentication.md) first.

> Response examples are **real** (live v8 panel), with values anonymized. `status`: `0` = success.

The "Websites" section has tabs: **PHP, Node, Proxy, Python**. This page covers PHP/WP sites. (Node projects are separate — see [nodejs-projects.md](nodejs-projects.md).)

## Methods

| Action | Endpoint |
|--------|----------|
| List | `/v2/data?action=getData` (`table=sites`) |
| Create | `/v2/site?action=AddSite` |
| Delete | `/v2/site?action=DeleteSite` |
| PHP versions | `/v2/site?action=GetPHPVersion` |
| Site types | `/v2/site?action=get_site_types` |

---

## List — `POST /v2/data?action=getData`

Body (flat fields): `p=1&limit=10&table=sites&search=&order=&type=-1&re_order=`

**Response (one row):**
```json
{
  "status": 0,
  "message": {
    "where": "`project_type` IN ('PHP', 'WP')",
    "page": "<div>…Total 1…</div>",
    "data": [
      {
        "id": 3,
        "name": "site.example.com",
        "path": "/www/wwwroot/site.example.com",
        "status": "1",
        "ps": "site_example_com",
        "addtime": "2026-06-07 15:45:13",
        "php_version": "8.3",
        "project_type": "PHP",
        "ssl": -1,
        "site_ssl": -1,
        "domain": 1,
        "quota": { "used": 0, "size": 0 },
        "backup_count": 0,
        "rname": "site.example.com"
      }
    ]
  }
}
```
| Field | Meaning |
|-------|---------|
| `name` / `rname` | primary domain |
| `path` | site root directory |
| `status` | `"1"` = active |
| `php_version` | PHP version |
| `project_type` | `PHP` / `WP` |
| `ssl` / `site_ssl` | `-1` = SSL not configured |
| `domain` | number of bound domains |

*(The response also has `ico` — a base64 favicon, omitted here.)*

---

## Create — `POST /v2/site?action=AddSite`

Body (flat fields; `webname` is a JSON string):
```
webname={"domain":"site.example.com","domainlist":[],"count":0}&port=80&type=PHP&ps=<note>&path=/www/wwwroot/site.example.com&ftp=false&sql=false&codeing=utf8&version=83&type_id=0&set_ssl=0&force_ssl=0&is_create_default_file=true&ssl_auto=0
```
| Parameter | Description |
|-----------|-------------|
| `webname` | JSON: `{domain, domainlist:[extra domains], count}` |
| `port` | port (80) |
| `type` | project type (`PHP`) |
| `path` | root directory |
| `ftp` | `false` or an FTP-user object |
| `sql` | `false` or DB details for auto-creation |
| `version` | PHP version (`83` = 8.3) |
| `codeing` | charset (`utf8`) |
| `set_ssl` / `force_ssl` / `ssl_auto` | SSL flags (0 = off) |
| `is_create_default_file` | create a starter html |

**Response:**
```json
{ "status": 0, "message": { "siteId": 3, "siteStatus": true, "ftpStatus": false, "databaseStatus": false, "ssl": false, "redirect": true } }
```

---

## Delete — `POST /v2/site?action=DeleteSite`

Body: `id=3&webname=site.example.com&path=1&ftp=1&database=1`
| Parameter | Description |
|-----------|-------------|
| `id` | site id |
| `webname` | domain |
| `path` | `1` = also delete the root directory |
| `ftp` | `1` = also delete the linked FTP user |
| `database` | `1` = also delete the linked database |

**Response:** `{"status":0,"message":{"result":"Successfully deleted site!"}}`

---

## Misc

- **PHP versions:** `POST /v2/site?action=GetPHPVersion` — list of available versions.
- Other site actions (start/stop, SSL, settings, backup, domain binding) can be captured via the "discover → execute" recipe ([authentication.md](authentication.md)).
- Requesting SSL when adding a site requires the domain to resolve to the server (A record) — for testing, disable it (`set_ssl=0`).
