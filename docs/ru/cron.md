# Планировщик (Cron)

[English version](../en/cron.md) · [⌂ Главная](../../README.ru.md)

Управление запланированными задачами в aaPanel (`/v2/crontab`). Сначала прочитайте [authentication.md](authentication.md).

> Примеры **реальные** (живая панель v8), значения обезличены. `status`: `0` = успех. Текст `message.result` **локализован** (часть результатов — стабильные токены вроде `Add_success` / `Del_success`, остальное зависит от языка интерфейса) — проверяйте `status`.

Пути авторизации: снято на сессии (`/<apsess_token>/v2/crontab?action=…`); с `api_sk` вызывайте от корня. См. [authentication.md](authentication.md). Тела — `application/x-www-form-urlencoded`.

## Методы

| Действие | Эндпоинт |
|----------|----------|
| Список задач | `/v2/crontab?action=GetCrontab` |
| Группы типов задач | `/v2/crontab?action=get_crontab_types` |
| Создать задачу | `/v2/crontab?action=AddCrontab` |
| Запустить сейчас | `/v2/crontab?action=StartTask` |
| Лог выполнения | `/v2/crontab?action=GetLogs` |
| Включить / отключить | `/v2/crontab?action=set_cron_status` |
| Удалить задачу | `/v2/crontab?action=DelCrontab` |

---

## Список задач — `POST /v2/crontab?action=GetCrontab`

Тело: `search=&type_id=&order_param=` (всё пусто = все задачи).

**Ответ (одна задача):**
```json
{
  "status": 0,
  "message": [
    {
      "id": 1, "name": "mytask", "type": "day",
      "where1": "1", "where_hour": 1, "where_minute": 30,
      "echo": "f20d8e16a8cfc62631535790e1225430",
      "status": 1, "sType": "toShell", "sName": "ALL",
      "sBody": "echo hello", "user": "root",
      "type_zh": "Per Day", "cycle": "Один раз в день в 1:30",
      "type_id": 0, "rname": "mytask", "sort": 0,
      "save": "", "backupTo": "", "save_local": 0,
      "notice": 0, "db_type": "mysql", "db_backup_path": "/www/backup"
    }
  ]
}
```
| Поле | Значение |
|------|----------|
| `id` | id задачи (для запуска/лога/статуса/удаления) |
| `name` | название |
| `type` | тип расписания (`day`, `hour`, `minute`, `week`, `month`, `minute-n`, `hour-n`) |
| `where1` / `where_hour` / `where_minute` | значения расписания (интервал / час / минута) |
| `sType` | вид задачи — `toShell` (shell-скрипт), бэкап сайта/БД, очистка логов, доступ по URL, … |
| `sBody` | тело shell-скрипта (для `toShell`) |
| `status` | `1` = активна, `0` = остановлена |
| `echo` | внутренний токен задачи |
| `cycle` | человекочитаемое расписание |

`get_crontab_types` (без тела) возвращает список пользовательских групп типов задач (`[]`, если нет).

---

## Создать задачу — `POST /v2/crontab?action=AddCrontab`

Тело (shell-скрипт, ежедневно в 01:30):
```
name=mytask&type=day&where1=1&week=1&hour=1&minute=30&second=&user=root&sName=ALL&sBody=echo+hello&sType=toShell&save=&backupTo=&urladdress=http://&save_local=0&notice=0&notice_channel=&db_type=mysql&split_type=&split_value=3&flock=1&timeSet=1&db_backup_path=/www/backup&timeType=sday&special_time=&log_cut_path=/www/wwwlogs/history_backups&user_agent=&version=&table_list=&zip_password=
```
Основные параметры:

| Параметр | Описание |
|----------|----------|
| `name` | название задачи |
| `type` | расписание: `day`, `hour`, `minute`, `week`, `month`, `minute-n`, `hour-n` |
| `where1` | интервал N (например, каждые N минут/часов) |
| `week` | день недели (для `type=week`) |
| `hour` / `minute` / `second` | время суток |
| `user` | пользователь выполнения (`root`, …) |
| `sType` | вид задачи: `toShell` (shell), бэкап сайта/БД, очистка логов, доступ по URL |
| `sBody` | shell-скрипт (для `toShell`) |
| `sName` | цель (`ALL` для shell; имя сайта/БД для бэкапов) |
| `notice` / `notice_channel` | уведомление при запуске |

Задачи бэкапа/очистки логов дополнительно используют `save`, `backupTo`, `save_local`, `db_type`, `split_type`, `split_value`, `db_backup_path`, `log_cut_path`, `zip_password`.

Ответ: `{"status":0,"message":{"result":"Add_success","id":1}}` — возвращается `id` новой задачи.

> Снято на живой панели только сочетание **shell-скрипт + ежедневно**; другие комбинации `type`/`sType` (бэкапы, очистка логов, доступ по URL, интервалы в N минут) используют тот же эндпоинт — снимите их точные значения полей рецептом.

---

## Запустить сейчас — `POST /v2/crontab?action=StartTask`
Тело: `id=1`
Ответ: `{"status":0,"message":{"result":"Crontab_task_exec"}}` (выполняется немедленно, может занять время)

## Лог выполнения — `POST /v2/crontab?action=GetLogs`
Тело: `id=1`
Ответ: `{"status":0,"message":{"result":"<вывод задачи>\n----…"}}` — stdout последнего запуска.

## Включить / отключить — `POST /v2/crontab?action=set_cron_status`
Тело: `id=1&if_stop=false`

| Параметр | Описание |
|----------|----------|
| `id` | id задачи |
| `if_stop` | `true` = также убить задачу, если она сейчас выполняется; `false` = просто переключить |

Ответ: `{"status":0,"message":{"result":"Настройка успешно!"}}`

## Удалить задачу — `POST /v2/crontab?action=DelCrontab`
Тело: `id=1`
Ответ: `{"status":0,"message":{"result":"Del_success"}}`

---

## Прочие действия (снять рецептом)

Редактирование задачи (кнопка «Изменить» открывает ту же форму → вероятно `ModifyCrontab`), библиотека скриптов и очистка логов снимаются рецептом «разведка → исполнение» ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)).
