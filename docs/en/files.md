# Files (File Manager)

[Русская версия](../ru/files.md) · [⌂ Home](../../README.md)

The aaPanel **Files** module (`/v2/files`) — browse, create, edit, move, copy, permissions, archive, upload, remote download, delete and the recycle bin. Read [authentication.md](authentication.md) first.

> All request/response examples are **real** (live v8 panel), with paths/values anonymized.
> `status`: `0` = success, `-1` = error. The `message.result` / `message.msg` text is a **localized** human string (it follows the panel UI language — examples below were captured on a Russian UI), so branch on `status`, never on the message text.

## Authentication note (paths in this page)

Captured over **session** auth, so the real requests went to `https://<server>:<port>/<apsess_token>/v2/files?action=…` with `x-http-token` + cookie. With the recommended **`api_sk`** key, drop the `apsess` segment and call from the panel root: `https://<server>:<port>/v2/files?action=…` with `request_token` signing (see [authentication.md](authentication.md)). Everything else (action, body) is identical.

All bodies are `application/x-www-form-urlencoded` unless noted (upload is `multipart/form-data`).

## Methods

| Action | Endpoint | Purpose |
|--------|----------|---------|
| List directory | `/v2/files?action=GetDirNew` | folders + files of a path |
| Create folder | `/v2/files?action=CreateDir` | mkdir |
| Create file | `/v2/files?action=CreateFile` | touch empty file |
| Read file body | `/v2/files?action=GetFileBody` | open in editor |
| Save file body | `/v2/files?action=SaveFileBody` | write editor content |
| Rename / move | `/v2/files?action=MvFile` | rename (same dir) or move |
| Check conflicts | `/v2/files?action=CheckExistsFiles` | pre-check before paste |
| Copy file | `/v2/files?action=CopyFile` | copy a file |
| Copy folder | `/v2/files?action=CopyDir` | copy a directory |
| Get permissions | `/v2/files?action=GetFileAccess` | read chmod/chown |
| Set permissions | `/v2/files?action=SetFileAccess` | chmod + chown (recursive opt.) |
| Compress | `/v2/files?action=Zip` | create archive |
| Extract | `/v2/files?action=UnZip` | extract archive |
| Upload pre-check | `/v2/files?action=upload_files_exists` | does target exist? |
| Upload | `/v2/files?action=upload` | chunked multipart upload |
| Remote download | `/v2/files?action=DownloadFile` | download a URL to the server |
| Remote tasks | `/v2/files?action=get_download_url_list` | list remote-download tasks |
| Batch op | `/v2/files?action=SetBatchData` | batch copy / move / delete |
| Delete file | `/v2/files?action=DeleteFile` | delete one file → recycle bin |
| Delete folder | `/v2/files?action=DeleteDir` | delete one dir → recycle bin |
| Recycle: list | `/v2/files?action=Get_Recycle_bin` | list recycle bin |
| Recycle: restore | `/v2/files?action=Re_Recycle_bin` | restore an item |
| Recycle: purge one | `/v2/files?action=Del_Recycle_bin` | permanently delete one item |
| Recycle: empty all | `/v2/files?action=Close_Recycle_bin` | empty the whole bin |

---

## List directory — `POST /v2/files?action=GetDirNew`

Body: `path=/www/wwwroot/example&is_operating=true&p=1&showRow=100&disk=true`

| Parameter | Description |
|-----------|-------------|
| `path` | directory to list |
| `p` | page number |
| `showRow` | rows per page |
| `disk` | `true` = also return disk-usage info |
| `is_operating` | UI flag (send `true`) |

**Response (trimmed):**
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
`dir` = subfolders, `files` = files. Per-entry fields: `nm` name, `sz` size (bytes), `mt` mtime (unix), `acc` permissions (octal), `user` owner, `lnk` symlink target, `durl` download URL, `fav` favorite flag, `top` pinned, `rmk` note. `file_recycle: true` means the file recycle bin is enabled (deletes go to the bin).

---

## Create folder — `POST /v2/files?action=CreateDir`

Body: `path=/www/wwwroot/example/newdir`
Response: `{"status":0,"message":{"result":"Created directory successfully"}}`

## Create file — `POST /v2/files?action=CreateFile`

Body: `path=/www/wwwroot/example/hello.txt`
Response: `{"status":0,"message":{"result":"File created successfully"}}`

Both take a single absolute `path` and return `status: 0` on success.

---

## Read file body — `POST /v2/files?action=GetFileBody`

Body: `path=/www/wwwroot/example/hello.txt`

**Response:**
```json
{
  "status": 0,
  "message": {
    "only_read": false,
    "size": 30,
    "encoding": "utf-8",
    "data": "file contents here…",
    "historys": [],
    "auto_save": null,
    "st_mtime": "1780896861"
  }
}
```
| Field | Meaning |
|-------|---------|
| `data` | full file text |
| `encoding` | detected encoding (`utf-8`, `ascii`, …) |
| `only_read` | `true` = read-only |
| `st_mtime` | mtime token — **pass it back** to `SaveFileBody` for conflict detection |

## Save file body — `POST /v2/files?action=SaveFileBody`

Body: `data=<file text>&path=/www/wwwroot/example/hello.txt&encoding=utf-8&st_mtime=1780896861&force=0`

| Parameter | Description |
|-----------|-------------|
| `data` | new file content |
| `path` | file path |
| `encoding` | encoding to write (`utf-8`) |
| `st_mtime` | mtime from the last `GetFileBody` — optimistic lock |
| `force` | `0` = abort if the file changed on disk since `st_mtime`; `1` = overwrite anyway |

Response: `{"status":0,"message":{"msg":"Saved!","historys":["1780896922"],"st_mtime":"1780896922","status":true}}`

> The `st_mtime` + `force=0` pair is concurrency control: if another process modified the file after you opened it, the save is rejected unless you resend with `force=1`. Keep the returned `st_mtime` for the next save.

---

## Rename / move — `POST /v2/files?action=MvFile`

One endpoint does both. Body:
```
sfile=/www/wwwroot/example/hello.txt&dfile=/www/wwwroot/example/renamed.txt&rename=true
```
| Parameter | Description |
|-----------|-------------|
| `sfile` | source path |
| `dfile` | destination path |
| `rename` | `true` = rename in place; omit / `false` = move to another directory |

Response: `{"status":0,"message":{"result":"Renamed successfully"}}`

---

## Copy

The UI "Copy → Paste" flow runs a conflict pre-check, then the copy.

### 1. Pre-check — `POST /v2/files?action=CheckExistsFiles`
Body: `dfile=/www/wwwroot/example/sub&filename=renamed.txt`
Response: `[]` (empty array = no conflicts; otherwise the array lists names that already exist in `dfile`).

### 2a. Copy file — `POST /v2/files?action=CopyFile`
Body: `sfile=/www/wwwroot/example/renamed.txt&dfile=/www/wwwroot/example/sub/renamed.txt`
Response: `{"status":0,"message":{"result":"File copied successfully"}}`

### 2b. Copy folder — `POST /v2/files?action=CopyDir`
Same shape (`sfile` / `dfile` are directories). Use `CopyDir` for directories, `CopyFile` for files.

---

## Permissions

### Read — `POST /v2/files?action=GetFileAccess`
Body: `filename=/www/wwwroot/example/sub/renamed.txt`
Response: `{"chmod":"644","chown":"www"}`

### Set — `POST /v2/files?action=SetFileAccess`
Body: `user=www&access=700&all=True&filename=/www/wwwroot/example/sub/renamed.txt`

| Parameter | Description |
|-----------|-------------|
| `access` | octal permission, 3 digits (`644`, `700`, `755`, …) — `chmod` |
| `user` | owner (and group) — `chown` |
| `all` | `True` = apply recursively to subdirectories; `False` = this item only |
| `filename` | target path |

Response: `{"status":0,"message":{"result":"Settings applied successfully"}}`

---

## Archive

### Compress — `POST /v2/files?action=Zip`
Body:
```
sfile=renamed.txt&dfile=/www/wwwroot/example/sub/renamed.txt.tar.gz&z_type=tar.gz&path=/www/wwwroot/example/sub
```
| Parameter | Description |
|-----------|-------------|
| `path` | working directory |
| `sfile` | name(s) inside `path` to compress (relative) |
| `dfile` | full path of the archive to create |
| `z_type` | archive format (`tar.gz`, `zip`, `7z`, …) |

Response: `{"status":0,"message":{"result":"Compression succeeded"}}`

### Extract — `POST /v2/files?action=UnZip`
Body:
```
sfile=/www/wwwroot/example/sub/renamed.txt.tar.gz&dfile=/www/wwwroot/example/sub&type=tar&coding=UTF-8&password=
```
| Parameter | Description |
|-----------|-------------|
| `sfile` | archive path |
| `dfile` | destination directory |
| `type` | archive type (`tar`, `zip`, …) |
| `coding` | filename encoding (`UTF-8`, …) |
| `password` | password for protected archives (empty if none) |

Response: `{"status":0,"message":{"result":"Extraction succeeded"}}`

---

## Upload

Chunked upload: a pre-check, then one `upload` call per chunk.

### 1. Pre-check — `POST /v2/files?action=upload_files_exists`
Body: `files=/www/wwwroot/example/sub/notes.txt`
Response:
```json
{ "status": 0, "message": [
  { "filename": "/www/wwwroot/example/sub/notes.txt", "exists": false, "size": 0, "mtime": 0, "isfile": false }
]}
```

### 2. Upload — `POST /v2/files?action=upload` (`multipart/form-data`)
Form fields:

| Field | Description |
|-------|-------------|
| `f_path` | destination directory (with trailing `/`) |
| `f_name` | file name |
| `f_size` | total file size in bytes |
| `f_start` | byte offset of this chunk (`0` for the first/only chunk) |
| `blob` | the binary chunk (`filename="blob"`, `Content-Type: application/octet-stream`) |

Example body:
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

<file bytes>
------WebKitFormBoundary…--
```
Response: `{"status":0,"message":{"result":"Uploaded successfully"}}`

> Large files are sent in chunks: split the file and call `upload` repeatedly, advancing `f_start` by the chunk size each time (`f_size` stays the total). The server appends each chunk at the given offset.

---

## Remote download (download a URL to the server) — `POST /v2/files?action=DownloadFile`

Body: `url=https://example.com/file.bin&path=/www/wwwroot/example/sub&filename=file.bin`

| Parameter | Description |
|-----------|-------------|
| `url` | source URL |
| `path` | destination directory |
| `filename` | name to save as |

Response: `{"status":0,"message":{"result":"Download task added to the queue"}}` — the download runs **asynchronously** as a task.

Poll the tasks with `POST /v2/files?action=get_download_url_list` (body `p=1&row=12`):
```json
{ "status": 0, "message": { "page": "…", "shift": "0", "row": "12", "data": [] } }
```

---

## Batch operations — `POST /v2/files?action=SetBatchData`

Used by the toolbar when multiple items are selected (batch copy / cut / delete). Body:
```
data=["renamed.txt","renamed.txt.tar.gz","robots.txt"]&type=4&path=/www/wwwroot/example/sub
```
| Parameter | Description |
|-----------|-------------|
| `data` | JSON array of names (relative to `path`) |
| `path` | working directory |
| `type` | operation code — **`4` = delete** (verified). Copy/move codes use the same endpoint; capture them via the recipe if needed. |

Response (delete): `{"status":0,"message":{"result":"3 files or directories were moved to the recycle bin"}}`

---

## Delete

> If the file recycle bin is enabled (`file_recycle: true` from `GetDirNew`), single deletes **move items to the recycle bin** rather than erasing them. In the UI the buttons show a confirm dialog; the API endpoint itself deletes immediately on call.

### Delete file — `POST /v2/files?action=DeleteFile`
Body: `path=/www/wwwroot/example/sub/notes.txt`
Response: `{"status":0,"message":{"result":"File moved to the recycle bin"}}`

### Delete folder — `POST /v2/files?action=DeleteDir`
Body: `path=/www/wwwroot/example/sub`
Response: `{"status":0,"message":{"result":"Directory moved to the recycle bin"}}`

---

## Recycle bin

### List — `POST /v2/files?action=Get_Recycle_bin`
No body.
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
| Field | Meaning |
|-------|---------|
| `rname` | internal recycle id (`_bt_`-encoded original path + `_t_` timestamp) — use it for restore/purge |
| `dname` | original directory the item came from |
| `name` | display name |
| `status` / `status_db` | file / database recycle bin enabled flags |

### Restore — `POST /v2/files?action=Re_Recycle_bin`
Body: `path=<rname>` (the `rname` from the list).
Response: `{"status":0,"message":{"result":"Restored successfully"}}`

> Restore **fails** (`status: -1`, "Restore failed") if the item's original parent directory no longer exists — recreate the parent path first, or restore the parent folder.

### Permanently delete one — `POST /v2/files?action=Del_Recycle_bin`
Body: `path=<rname>`.
Response: `{"status":0,"message":{"result":"Permanently deleted <path> from the recycle bin"}}`

> ⚠️ In the UI this is guarded by a **two-step confirmation** (you must manually type the phrase `Delete`). That phrase is a UI guard only — the API call carries just `path` and deletes immediately.

### Empty the whole bin — `POST /v2/files?action=Close_Recycle_bin`
No body. Permanently deletes **everything** in the recycle bin.
Response: `{"status":0,"message":{"result":"Recycle bin emptied"}}`

> ⚠️ Irreversible. The UI guards it with a manually-typed `Empty Recycle Bin` phrase; the API call carries no parameters.

---

## Other actions (capture via the recipe)

The Files section also has: favorites (`Favorite`), file/dir protection, search file content, soft links (`New → Soft Link`), share list, and per-row "More". Capture any of these with the discover → execute recipe ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)).
