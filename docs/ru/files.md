# Файлы (Файловый менеджер)

[English version](../en/files.md) · [⌂ Главная](../../README.ru.md)

Модуль **Файлы** aaPanel (`/v2/files`) — просмотр, создание, редактирование, перемещение, копирование, права, архивы, загрузка, загрузка по URL, удаление и корзина. Сначала прочитайте [authentication.md](authentication.md).

> Все примеры запросов/ответов **реальные** (живая панель v8), пути и значения обезличены.
> `status`: `0` = успех, `-1` = ошибка. Текст `message.result` / `message.msg` — **локализованная** человекочитаемая строка (зависит от языка интерфейса панели; примеры ниже сняты на русском UI), поэтому проверяйте `status`, а не текст сообщения.

## Про авторизацию (пути на этой странице)

Снято на **сессионной** авторизации, поэтому реальные запросы шли на `https://<сервер>:<порт>/<apsess_token>/v2/files?action=…` с `x-http-token` + cookie. С рекомендуемым ключом **`api_sk`** убираете сегмент `apsess` и вызываете от корня панели: `https://<сервер>:<порт>/v2/files?action=…` с подписью `request_token` (см. [authentication.md](authentication.md)). Всё остальное (action, тело) идентично.

Тела запросов — `application/x-www-form-urlencoded`, кроме загрузки (она `multipart/form-data`).

## Методы

| Действие | Эндпоинт | Назначение |
|----------|----------|-----------|
| Список каталога | `/v2/files?action=GetDirNew` | папки + файлы пути |
| Создать папку | `/v2/files?action=CreateDir` | mkdir |
| Создать файл | `/v2/files?action=CreateFile` | пустой файл |
| Прочитать файл | `/v2/files?action=GetFileBody` | открыть в редакторе |
| Сохранить файл | `/v2/files?action=SaveFileBody` | записать содержимое |
| Переименовать / переместить | `/v2/files?action=MvFile` | переименование или перемещение |
| Проверка конфликтов | `/v2/files?action=CheckExistsFiles` | предпроверка перед вставкой |
| Копировать файл | `/v2/files?action=CopyFile` | копия файла |
| Копировать папку | `/v2/files?action=CopyDir` | копия каталога |
| Прочитать права | `/v2/files?action=GetFileAccess` | chmod/chown |
| Задать права | `/v2/files?action=SetFileAccess` | chmod + chown (опц. рекурсивно) |
| Сжать | `/v2/files?action=Zip` | создать архив |
| Распаковать | `/v2/files?action=UnZip` | распаковать архив |
| Предпроверка загрузки | `/v2/files?action=upload_files_exists` | существует ли цель |
| Загрузить | `/v2/files?action=upload` | чанковая multipart-загрузка |
| Загрузка по URL | `/v2/files?action=DownloadFile` | скачать URL на сервер |
| Задачи загрузки | `/v2/files?action=get_download_url_list` | список задач загрузки по URL |
| Пакетная операция | `/v2/files?action=SetBatchData` | массовое копир./перемещ./удаление |
| Удалить файл | `/v2/files?action=DeleteFile` | файл → корзина |
| Удалить папку | `/v2/files?action=DeleteDir` | каталог → корзина |
| Корзина: список | `/v2/files?action=Get_Recycle_bin` | содержимое корзины |
| Корзина: восстановить | `/v2/files?action=Re_Recycle_bin` | восстановить элемент |
| Корзина: удалить один | `/v2/files?action=Del_Recycle_bin` | удалить навсегда один элемент |
| Корзина: очистить всё | `/v2/files?action=Close_Recycle_bin` | опустошить корзину |

---

## Список каталога — `POST /v2/files?action=GetDirNew`

Тело: `path=/www/wwwroot/example&is_operating=true&p=1&showRow=100&disk=true`

| Параметр | Описание |
|----------|----------|
| `path` | каталог для листинга |
| `p` | номер страницы |
| `showRow` | строк на страницу |
| `disk` | `true` = вернуть и сведения о диске |
| `is_operating` | UI-флаг (передавайте `true`) |

**Ответ (сокращённо):**
```json
{
  "status": 0,
  "timestamp": 1780896618,
  "message": {
    "path": "/www/wwwroot/example",
    "file_recycle": true,
    "page": "<div>…Total 4…</div>",
    "dir": [
      { "nm": "app", "sz": 4096, "mt": 1775798099, "acc": "755", "user": "www",
        "lnk": "", "durl": "", "cmp": 0, "fav": "0", "rmk": "", "top": 0, "sn": "app" }
    ],
    "files": [
      { "nm": "backup.tar.gz", "sz": 491042918, "mt": 1775021497, "acc": "644", "user": "www",
        "lnk": "", "durl": "", "cmp": 0, "fav": "0", "rmk": "", "top": 0, "sn": "backup.tar.gz" }
    ],
    "disk": [
      { "filesystem": "/dev/…", "type": "ext4", "path": "/",
        "size": ["128G","32G","91G","26%"], "inodes": ["8519680","691210","7828470","9%"] }
    ],
    "dir_history": [],
    "search_history": [],
    "is_max": false
  }
}
```
`dir` = подпапки, `files` = файлы. Поля элемента: `nm` имя, `sz` размер (байты), `mt` mtime (unix), `acc` права (octal), `user` владелец, `lnk` цель симлинка, `durl` URL скачивания, `fav` избранное, `top` закреплён, `rmk` заметка. `file_recycle: true` — файловая корзина включена (удаления уходят в корзину).

---

## Создать папку — `POST /v2/files?action=CreateDir`

Тело: `path=/www/wwwroot/example/newdir`
Ответ: `{"status":0,"message":{"result":"Успешно создал каталог!"}}`

## Создать файл — `POST /v2/files?action=CreateFile`

Тело: `path=/www/wwwroot/example/hello.txt`
Ответ: `{"status":0,"message":{"result":"Успешно созданный файл!"}}`

Оба принимают один абсолютный `path` и возвращают `status: 0` при успехе.

---

## Прочитать файл — `POST /v2/files?action=GetFileBody`

Тело: `path=/www/wwwroot/example/hello.txt`

**Ответ:**
```json
{
  "status": 0,
  "message": {
    "only_read": false,
    "size": 30,
    "encoding": "utf-8",
    "data": "содержимое файла…",
    "historys": [],
    "auto_save": null,
    "st_mtime": "1780896861"
  }
}
```
| Поле | Значение |
|------|----------|
| `data` | полный текст файла |
| `encoding` | определённая кодировка (`utf-8`, `ascii`, …) |
| `only_read` | `true` = только чтение |
| `st_mtime` | токен mtime — **верните его** в `SaveFileBody` для контроля конфликтов |

## Сохранить файл — `POST /v2/files?action=SaveFileBody`

Тело: `data=<текст файла>&path=/www/wwwroot/example/hello.txt&encoding=utf-8&st_mtime=1780896861&force=0`

| Параметр | Описание |
|----------|----------|
| `data` | новое содержимое |
| `path` | путь к файлу |
| `encoding` | кодировка записи (`utf-8`) |
| `st_mtime` | mtime из последнего `GetFileBody` — оптимистичная блокировка |
| `force` | `0` = отменить, если файл изменился на диске после `st_mtime`; `1` = перезаписать всё равно |

Ответ: `{"status":0,"message":{"msg":"Сэкономю!","historys":["1780896922"],"st_mtime":"1780896922","status":true}}`

> Пара `st_mtime` + `force=0` — контроль одновременного доступа: если файл изменил другой процесс после открытия, сохранение отклоняется, пока не повторите с `force=1`. Сохраняйте возвращённый `st_mtime` для следующего сохранения.

---

## Переименовать / переместить — `POST /v2/files?action=MvFile`

Один эндпоинт делает и то, и другое. Тело:
```
sfile=/www/wwwroot/example/hello.txt&dfile=/www/wwwroot/example/renamed.txt&rename=true
```
| Параметр | Описание |
|----------|----------|
| `sfile` | исходный путь |
| `dfile` | путь назначения |
| `rename` | `true` = переименование на месте; без него / `false` = перемещение в другой каталог |

Ответ: `{"status":0,"message":{"result":"Успешно переименован!"}}`

---

## Копирование

Сценарий UI «Копировать → Вставить» сначала проверяет конфликты, затем копирует.

### 1. Предпроверка — `POST /v2/files?action=CheckExistsFiles`
Тело: `dfile=/www/wwwroot/example/sub&filename=renamed.txt`
Ответ: `[]` (пустой массив = конфликтов нет; иначе массив содержит имена, уже существующие в `dfile`).

### 2a. Копировать файл — `POST /v2/files?action=CopyFile`
Тело: `sfile=/www/wwwroot/example/renamed.txt&dfile=/www/wwwroot/example/sub/renamed.txt`
Ответ: `{"status":0,"message":{"result":"Успешно скопированный файл!"}}`

### 2b. Копировать папку — `POST /v2/files?action=CopyDir`
Та же форма (`sfile` / `dfile` — каталоги). Для каталогов используйте `CopyDir`, для файлов — `CopyFile`.

---

## Права доступа

### Прочитать — `POST /v2/files?action=GetFileAccess`
Тело: `filename=/www/wwwroot/example/sub/renamed.txt`
Ответ: `{"chmod":"644","chown":"www"}`

### Задать — `POST /v2/files?action=SetFileAccess`
Тело: `user=www&access=700&all=True&filename=/www/wwwroot/example/sub/renamed.txt`

| Параметр | Описание |
|----------|----------|
| `access` | права octal, 3 цифры (`644`, `700`, `755`, …) — `chmod` |
| `user` | владелец (и группа) — `chown` |
| `all` | `True` = рекурсивно на подкаталоги; `False` = только этот элемент |
| `filename` | целевой путь |

Ответ: `{"status":0,"message":{"result":"Настройка успешно!"}}`

---

## Архивы

### Сжать — `POST /v2/files?action=Zip`
Тело:
```
sfile=renamed.txt&dfile=/www/wwwroot/example/sub/renamed.txt.tar.gz&z_type=tar.gz&path=/www/wwwroot/example/sub
```
| Параметр | Описание |
|----------|----------|
| `path` | рабочий каталог |
| `sfile` | имя(имена) внутри `path` для сжатия (относительные) |
| `dfile` | полный путь создаваемого архива |
| `z_type` | формат архива (`tar.gz`, `zip`, `7z`, …) |

Ответ: `{"status":0,"message":{"result":"Сжатие удалось!"}}`

### Распаковать — `POST /v2/files?action=UnZip`
Тело:
```
sfile=/www/wwwroot/example/sub/renamed.txt.tar.gz&dfile=/www/wwwroot/example/sub&type=tar&coding=UTF-8&password=
```
| Параметр | Описание |
|----------|----------|
| `sfile` | путь к архиву |
| `dfile` | каталог назначения |
| `type` | тип архива (`tar`, `zip`, …) |
| `coding` | кодировка имён файлов (`UTF-8`, …) |
| `password` | пароль для защищённых архивов (пусто, если нет) |

Ответ: `{"status":0,"message":{"result":"…успех…"}}`

---

## Загрузка

Чанковая загрузка: предпроверка, затем по одному вызову `upload` на каждый чанк.

### 1. Предпроверка — `POST /v2/files?action=upload_files_exists`
Тело: `files=/www/wwwroot/example/sub/notes.txt`
Ответ:
```json
{ "status": 0, "message": [
  { "filename": "/www/wwwroot/example/sub/notes.txt", "exists": false, "size": 0, "mtime": 0, "isfile": false }
]}
```

### 2. Загрузка — `POST /v2/files?action=upload` (`multipart/form-data`)
Поля формы:

| Поле | Описание |
|------|----------|
| `f_path` | каталог назначения (с завершающим `/`) |
| `f_name` | имя файла |
| `f_size` | полный размер файла в байтах |
| `f_start` | смещение этого чанка в байтах (`0` для первого/единственного) |
| `blob` | бинарный чанк (`filename="blob"`, `Content-Type: application/octet-stream`) |

Пример тела:
```
------WebKitFormBoundary…
Content-Disposition: form-data; name="f_path"

/www/wwwroot/example/sub/
------WebKitFormBoundary…
Content-Disposition: form-data; name="f_name"

notes.txt
------WebKitFormBoundary…
Content-Disposition: form-data; name="f_size"

103
------WebKitFormBoundary…
Content-Disposition: form-data; name="f_start"

0
------WebKitFormBoundary…
Content-Disposition: form-data; name="blob"; filename="blob"
Content-Type: application/octet-stream

<байты файла>
------WebKitFormBoundary…--
```
Ответ: `{"status":0,"message":{"result":"Успешно загружено!"}}`

> Большие файлы отправляются чанками: разбейте файл и вызывайте `upload` многократно, увеличивая `f_start` на размер чанка (`f_size` остаётся полным). Сервер дописывает каждый чанк по указанному смещению.

---

## Загрузка по URL (скачать URL на сервер) — `POST /v2/files?action=DownloadFile`

Тело: `url=https://example.com/file.bin&path=/www/wwwroot/example/sub&filename=file.bin`

| Параметр | Описание |
|----------|----------|
| `url` | исходный URL |
| `path` | каталог назначения |
| `filename` | имя для сохранения |

Ответ: `{"status":0,"message":{"result":"Загрузить задание добавлено в очередь!"}}` — загрузка идёт **асинхронно**, как задача.

Опрос задач — `POST /v2/files?action=get_download_url_list` (тело `p=1&row=12`):
```json
{ "status": 0, "message": { "page": "…", "shift": "0", "row": "12", "data": [] } }
```

---

## Пакетные операции — `POST /v2/files?action=SetBatchData`

Используется тулбаром при выборе нескольких элементов (массовое копирование / вырезание / удаление). Тело:
```
data=["renamed.txt","renamed.txt.tar.gz","robots.txt"]&type=4&path=/www/wwwroot/example/sub
```
| Параметр | Описание |
|----------|----------|
| `data` | JSON-массив имён (относительно `path`) |
| `path` | рабочий каталог |
| `type` | код операции — **`4` = удаление** (проверено). Копирование/перемещение используют тот же эндпоинт; снимите их коды рецептом при необходимости. |

Ответ (удаление): `{"status":0,"message":{"result":"3 файлы или каталоги были перемещены в корзину в партиях"}}`

---

## Удаление

> Если файловая корзина включена (`file_recycle: true` из `GetDirNew`), одиночные удаления **переносят элементы в корзину**, а не стирают их. В UI кнопки показывают диалог подтверждения; сам API-эндпоинт удаляет сразу при вызове.

### Удалить файл — `POST /v2/files?action=DeleteFile`
Тело: `path=/www/wwwroot/example/sub/notes.txt`
Ответ: `{"status":0,"message":{"result":"Файл перенесен в корзин"}}`

### Удалить папку — `POST /v2/files?action=DeleteDir`
Тело: `path=/www/wwwroot/example/sub`
Ответ: `{"status":0,"message":{"result":"Справочник перешел в корзин!"}}`

---

## Корзина

### Список — `POST /v2/files?action=Get_Recycle_bin`
Без тела.
```json
{
  "status": 0,
  "message": {
    "dirs": [
      { "rname": "_bt_www_bt_wwwroot_bt_example_bt_sub_t_1780897870.137",
        "dname": "/www/wwwroot/example/sub", "name": "sub", "time": 1780897870, "size": 4096 }
    ],
    "files": [],
    "status": true,
    "status_db": false
  }
}
```
| Поле | Значение |
|------|----------|
| `rname` | внутренний id в корзине (`_bt_`-кодированный исходный путь + `_t_` метка времени) — нужен для восстановления/удаления |
| `dname` | исходный каталог элемента |
| `name` | отображаемое имя |
| `status` / `status_db` | флаги включённости файловой / БД корзины |

### Восстановить — `POST /v2/files?action=Re_Recycle_bin`
Тело: `path=<rname>` (значение `rname` из списка).
Ответ: `{"status":0,"message":{"result":"Восстановление удалось!"}}`

> Восстановление **не удаётся** (`status: -1`, «Восстановление не удалось!»), если исходного родительского каталога элемента больше нет — сначала пересоздайте путь или восстановите родительскую папку.

### Удалить навсегда один — `POST /v2/files?action=Del_Recycle_bin`
Тело: `path=<rname>`.
Ответ: `{"status":0,"message":{"result":"Постоянно удалено <путь> из корзины!"}}`

> ⚠️ В UI защищено **двухшаговым подтверждением** (нужно вручную ввести фразу `Delete`). Эта фраза — только UI-защита; API-запрос несёт лишь `path` и удаляет сразу.

### Опустошить всю корзину — `POST /v2/files?action=Close_Recycle_bin`
Без тела. Удаляет **всё** содержимое корзины навсегда.
Ответ: `{"status":0,"message":{"result":"Утилизация бина опустошила!"}}`

> ⚠️ Необратимо. В UI защищено вручную вводимой фразой `Empty Recycle Bin`; API-запрос не несёт параметров.

---

## Прочие действия (снять рецептом)

В разделе «Файлы» также есть: избранное (`Favorite`), защита файлов/каталогов, поиск по содержимому, символические ссылки (`New → Soft Link`), список общего доступа и построчное «Ещё». Любое из них снимается рецептом «разведка → исполнение» ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)).
