# Сайты (PHP/WP)

[English version](../en/sites.md) · [⌂ Главная](../../README.ru.md)

Управление веб-сайтами (PHP/WP) в aaPanel. Перед чтением — [authentication.md](authentication.md).

> Примеры ответов — **реальные** (живая панель v8), значения обезличены. `status`: `0` — успех.

Раздел «Веб-сайты» имеет вкладки: **PHP-проект, Node-проект, Proxy-проект, Python**. Здесь — PHP/WP-сайты. (Node-проекты — отдельно, см. [nodejs-projects.md](nodejs-projects.md).)

## Методы

| Действие | Эндпоинт |
|----------|----------|
| Список | `/v2/data?action=getData` (`table=sites`) |
| Создать | `/v2/site?action=AddSite` |
| Удалить | `/v2/site?action=DeleteSite` |
| Версии PHP | `/v2/site?action=GetPHPVersion` |
| Типы сайтов | `/v2/site?action=get_site_types` |

---

## Список — `POST /v2/data?action=getData`

Тело (плоские поля): `p=1&limit=10&table=sites&search=&order=&type=-1&re_order=`

**Ответ (одна строка):**
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
| Поле | Что значит |
|------|-----------|
| `name` / `rname` | основной домен |
| `path` | корневая папка сайта |
| `status` | `"1"` — активен |
| `php_version` | версия PHP |
| `project_type` | `PHP` / `WP` |
| `ssl` / `site_ssl` | `-1` — SSL не настроен |
| `domain` | число привязанных доменов |

*(В ответе ещё есть `ico` — base64-фавикон, опущен.)*

---

## Создать — `POST /v2/site?action=AddSite`

Тело (плоские поля; `webname` — JSON-строка):
```
webname={"domain":"site.example.com","domainlist":[],"count":0}&port=80&type=PHP&ps=<заметка>&path=/www/wwwroot/site.example.com&ftp=false&sql=false&codeing=utf8&version=83&type_id=0&set_ssl=0&force_ssl=0&is_create_default_file=true&ssl_auto=0
```
| Параметр | Описание |
|----------|----------|
| `webname` | JSON: `{domain, domainlist:[доп.домены], count}` |
| `port` | порт (80) |
| `type` | тип проекта (`PHP`) |
| `path` | корневая папка |
| `ftp` | `false` или объект с FTP-пользователем |
| `sql` | `false` или данные БД для авто-создания |
| `version` | версия PHP (`83` = 8.3) |
| `codeing` | кодировка (`utf8`) |
| `set_ssl` / `force_ssl` / `ssl_auto` | флаги SSL (0 — без) |
| `is_create_default_file` | создать стартовый html |

**Ответ:**
```json
{ "status": 0, "message": { "siteId": 3, "siteStatus": true, "ftpStatus": false, "databaseStatus": false, "ssl": false, "redirect": true } }
```

---

## Удалить — `POST /v2/site?action=DeleteSite`

Тело: `id=3&webname=site.example.com&path=1&ftp=1&database=1`
| Параметр | Описание |
|----------|----------|
| `id` | id сайта |
| `webname` | домен |
| `path` | `1` — удалить и корневую папку |
| `ftp` | `1` — удалить связанного FTP-пользователя |
| `database` | `1` — удалить связанную БД |

**Ответ:** `{"status":0,"message":{"result":"Successfully deleted site!"}}`

---

## Прочее

- **Версии PHP:** `POST /v2/site?action=GetPHPVersion` — список доступных версий.
- Остальные действия сайта (старт/стоп, SSL, настройки, бэкап, привязка домена) добираются рецептом «разведка → исполнение» ([authentication.md](authentication.md)).
- Создание SSL при добавлении сайта требует, чтобы домен резолвился на сервер (A-запись) — для теста SSL отключают (`set_ssl=0`).
