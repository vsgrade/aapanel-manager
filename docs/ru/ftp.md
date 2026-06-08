# FTP

[English version](../en/ftp.md) · [⌂ Главная](../../README.ru.md)

Управление FTP-пользователями в aaPanel (`/v2/ftp` + общий список через `/v2/data`). Сначала прочитайте [authentication.md](authentication.md).

> Примеры **реальные** (живая панель v8, Pureftpd), значения обезличены. `status`: `0` = успех. Текст `message.result` **локализован** (зависит от языка интерфейса) — проверяйте `status`, а не текст.

Пути авторизации: снято на сессии (`/<apsess_token>/v2/ftp?action=…`); с `api_sk` вызывайте от корня (`/v2/ftp?action=…`). См. [authentication.md](authentication.md). Тела — `application/x-www-form-urlencoded`.

## Методы

| Действие | Эндпоинт |
|----------|----------|
| Список | `/v2/data?action=getData` (`table=ftps`) |
| Создать пользователя | `/v2/ftp?action=AddUser` |
| Сменить пароль | `/v2/ftp?action=SetUserPassword` |
| Включить / отключить | `/v2/ftp?action=SetStatus` |
| Удалить пользователя | `/v2/ftp?action=DeleteUser` |

---

## Список — `POST /v2/data?action=getData`

Тело: `p=1&limit=10&search=&table=ftps`

**Ответ:**
```json
{
  "status": 0,
  "message": {
    "where": "",
    "page": "<div>…Total 1…</div>",
    "data": [
      {
        "id": 1, "pid": 0, "name": "ftpuser", "password": "<PASSWORD>",
        "status": "1", "ps": "ftpuser", "addtime": "2026-06-08 08:15:50",
        "path": "/www/wwwroot/ftpuser",
        "quota": { "used": 0, "size": 0, "quota_push": {"size":0,"used":0}, "quota_storage": {"size":0,"used":0} }
      }
    ],
    "search_history": []
  }
}
```
| Поле | Значение |
|------|----------|
| `id` | id FTP-пользователя (используется остальными эндпоинтами) |
| `name` | имя пользователя |
| `password` | пароль (хранится/возвращается в открытом виде) |
| `status` | `"1"` = активен, `"0"` = отключён |
| `path` | домашний каталог |
| `ps` | заметка |
| `quota` | квота / использование |

---

## Создать пользователя — `POST /v2/ftp?action=AddUser`

Тело: `ftp_username=ftpuser&ftp_password=<PASSWORD>&path=/www/wwwroot/ftpuser&ps=ftpuser`

| Параметр | Описание |
|----------|----------|
| `ftp_username` | имя пользователя |
| `ftp_password` | пароль |
| `path` | домашний каталог — **создаётся, если не существует** |
| `ps` | заметка |

Ответ: `{"status":0,"message":{"result":"Настройка успешно!"}}`

> Создание FTP-пользователя создаёт реальную системную FTP-учётку и каталог `path`. Удаление пользователя (ниже) этот каталог **не** удаляет — при необходимости чистите отдельно.

---

## Сменить пароль — `POST /v2/ftp?action=SetUserPassword`

Тело: `id=1&ftp_username=ftpuser&new_password=<NEW_PASSWORD>`
Ответ: `{"status":0,"message":{"result":"Настройка успешно!"}}`

## Включить / отключить — `POST /v2/ftp?action=SetStatus`

Тело: `id=1&status=0&username=ftpuser`

| Параметр | Описание |
|----------|----------|
| `id` | id FTP-пользователя |
| `username` | имя пользователя |
| `status` | `0` = отключить, `1` = включить |

Ответ: `{"status":0,"message":{"result":"Настройка успешно!"}}`

## Удалить пользователя — `POST /v2/ftp?action=DeleteUser`

Тело: `id=1&username=ftpuser`
Ответ: `{"status":0,"message":{"result":"Успешно удалил"}}`

---

## Прочие действия (снять рецептом)

В разделе FTP также есть **Установить путь** (построчно), **Изменить порт FTP** и **Анализ FTP-логов**. Снимаются рецептом «разведка → исполнение» ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)).
