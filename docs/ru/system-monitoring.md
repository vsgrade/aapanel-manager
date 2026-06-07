# Мониторинг сервера

[English version](../en/system-monitoring.md) · [⌂ Главная](../../README.ru.md)

Официальные системные эндпоинты — CPU, RAM, диск самого сервера. Это **документированный официальный API**, отлично работает через ключ `api_sk` (см. [authentication.md](authentication.md)).

**Базовый путь:**
```
POST https://<СЕРВЕР>:<ПОРТ>/system?action=<действие>
```
+ `request_time` и `request_token` в теле.

> Примеры ответов — **реальные** (живая панель v8).

## Методы

| Действие | Назначение |
|----------|-----------|
| [`GetSystemTotal`](#getsystemtotal) | CPU, RAM, ядра, ОС, версия панели, аптайм |
| [`GetDiskInfo`](#getdiskinfo) | Использование дисков |
| [`GetNetWork`](#getnetwork) | Сеть и нагрузка в реальном времени |

---

## `GetSystemTotal`

Общая статистика сервера. Параметров нет.

**Пример (curl, ключ):**
```bash
curl -k -X POST "https://<СЕРВЕР>:<ПОРТ>/system?action=GetSystemTotal" \
  --data-urlencode "request_time=$T" --data-urlencode "request_token=$TOKEN"
```

**Реальный ответ:**
```json
{
  "memTotal": 5782,
  "memFree": 2306,
  "memBuffers": 317,
  "memCached": 2034,
  "memRealUsed": 1125,
  "cpuNum": 6,
  "cpuRealUsed": 5.9,
  "time": "25 дн.",
  "system": "Ubuntu 24.04.3 LTS x86_64(Py3.12.3)",
  "isuser": 0,
  "isport": false,
  "version": "8.0.2"
}
```

| Поле | Что значит |
|------|-----------|
| `memTotal` | всего RAM, **МБ** |
| `memRealUsed` | реально занято RAM, **МБ** |
| `memFree` | свободно RAM, **МБ** |
| `memBuffers` / `memCached` | буферы / кэш, МБ |
| `cpuNum` | количество ядер CPU |
| `cpuRealUsed` | загрузка CPU, **%** |
| `time` | аптайм сервера |
| `system` | ОС |
| `version` | версия панели aaPanel |

> Через официальный путь `/system?...` ответ приходит «плоским объектом» (без обёртки `status/message`).

---

## `GetDiskInfo`

Информация по дискам/разделам. Параметров нет.

**Реальный ответ:**
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

| Поле | Что значит |
|------|-----------|
| `path` | точка монтирования |
| `type` | файловая система |
| `size` | массив **[всего, занято, свободно, использовано %]** |
| `inodes` | массив **[всего, занято, свободно, использовано %]** inode |

---

## `GetNetWork`

Сеть и нагрузка в реальном времени (трафик, load average). Виден в запросах панели на главной странице. Точную схему ответа снимите через рецепт «разведка → исполнение» ([authentication.md](authentication.md)).

---

## Потребление по каждому проекту

CPU/RAM **конкретного Node.js-проекта** берутся не отсюда, а из [`get_project_list`](nodejs-projects.md#1-get_project_list) → поле `load_info` (`cpu_percent`, `memory_used`).
