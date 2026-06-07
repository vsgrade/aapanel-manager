# Server Monitoring

[Русская версия](../ru/system-monitoring.md) · [⌂ Home](../../README.md)

Official system endpoints — the server's own CPU, RAM, and disk. This is the **documented official API** and works well via the `api_sk` key (see [authentication.md](authentication.md)).

**Base path:**
```
POST https://<SERVER>:<PORT>/system?action=<action>
```
+ `request_time` and `request_token` in the body.

> Response examples are **real** (live v8 panel).

## Methods

| Action | Purpose |
|--------|---------|
| [`GetSystemTotal`](#getsystemtotal) | CPU, RAM, cores, OS, panel version, uptime |
| [`GetDiskInfo`](#getdiskinfo) | Disk usage |
| [`GetNetWork`](#getnetwork) | Realtime network and load |

---

## `GetSystemTotal`

Overall server stats. No parameters.

**Example (curl, key):**
```bash
curl -k -X POST "https://<SERVER>:<PORT>/system?action=GetSystemTotal" \
  --data-urlencode "request_time=$T" --data-urlencode "request_token=$TOKEN"
```

**Real response:**
```json
{
  "memTotal": 5782,
  "memFree": 2306,
  "memBuffers": 317,
  "memCached": 2034,
  "memRealUsed": 1125,
  "cpuNum": 6,
  "cpuRealUsed": 5.9,
  "time": "25 days",
  "system": "Ubuntu 24.04.3 LTS x86_64(Py3.12.3)",
  "isuser": 0,
  "isport": false,
  "version": "8.0.2"
}
```

| Field | Meaning |
|-------|---------|
| `memTotal` | total RAM, **MB** |
| `memRealUsed` | RAM actually used, **MB** |
| `memFree` | free RAM, **MB** |
| `memBuffers` / `memCached` | buffers / cache, MB |
| `cpuNum` | number of CPU cores |
| `cpuRealUsed` | CPU usage, **%** |
| `time` | server uptime |
| `system` | OS |
| `version` | aaPanel panel version |

> Via the official `/system?...` path the response is a "flat object" (no `status/message` wrapper).

---

## `GetDiskInfo`

Disk/partition info. No parameters.

**Real response:**
```json
[
  {
    "filesystem": "/dev/mapper/ubuntu--vg-ubuntu--lv",
    "type": "ext4",
    "path": "/",
    "size": ["97G", "29G", "64G", "32%"],
    "inodes": ["6422528", "583549", "5838979", "10%"]
  }
]
```

| Field | Meaning |
|-------|---------|
| `path` | mount point |
| `type` | filesystem |
| `size` | array **[total, used, free, use%]** |
| `inodes` | array **[total, used, free, use%]** of inodes |

---

## `GetNetWork`

Realtime network and load (traffic, load average). Visible in the panel's home-page requests. Capture its exact response shape via the "discover → execute" recipe ([authentication.md](authentication.md)).

---

## Per-project usage

CPU/RAM for a **specific Node.js project** come not from here but from [`get_project_list`](nodejs-projects.md#1-get_project_list) → the `load_info` field (`cpu_percent`, `memory_used`).
