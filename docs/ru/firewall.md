# Firewall (Безопасность)

[English version](../en/firewall.md) · [⌂ Главная](../../README.ru.md)

Чтение состояния межсетевого экрана aaPanel через API (`/v2/firewall`). Сначала прочитайте [authentication.md](authentication.md).

> Примеры **реальные** (живая панель v8, бэкенд **ufw**), значения обезличены. `status`: `0` = успех.
> ⚠️ **Объём страницы:** здесь задокументированы только **read**-эндпоинты (проверены на живой панели). Операции записи (добавление/удаление/изменение правил портов, IP-правила, проброс портов, включение/выключение firewall) меняют безопасность сервера и намеренно **не** выполнялись на живом хосте — снимите их рецептом «разведка → исполнение» ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)). К записи правил относитесь с особой осторожностью: никогда не закрывайте порт панели, SSH (22) и другие порты доступа.

Пути авторизации: снято на сессии (`/<apsess_token>/v2/firewall/com/…`); с `api_sk` вызывайте от корня. Тела — `application/x-www-form-urlencoded`.

## Методы (чтение)

| Действие | Эндпоинт |
|----------|----------|
| Firewall вкл/выкл | `/v2/firewall/com/get_status` |
| Сводка firewall | `/v2/firewall/com/get_firewall_info` |
| Список правил портов | `/v2/firewall/com/port_rules_list` |

---

## Статус firewall — `POST /v2/firewall/com/get_status`
Без тела.
```json
{ "status": 0, "message": { "status": true, "init_status": { "status": true, "msg": "установлен." } } }
```
`message.status` = firewall включён (`true`/`false`).

## Сводка firewall — `POST /v2/firewall/com/get_firewall_info`
Без тела.
```json
{ "status": 0, "message": {
  "port": 24, "ip": 0, "trans": 0, "country": 0, "banned": 0,
  "type": "ufw", "update_time": "2026-06-05 16:30:09", "ping": true
}}
```
| Поле | Значение |
|------|----------|
| `port` | число правил портов |
| `ip` | число IP-правил |
| `trans` | число правил проброса портов |
| `country` | число правил по странам/регионам |
| `banned` | число забаненных IP |
| `type` | бэкенд firewall (`ufw` здесь; на других дистрибутивах — `firewalld` / `iptables`) |
| `ping` | разрешён ли ICMP/ping |

## Список правил портов — `POST /v2/firewall/com/port_rules_list`
Тело: `chain=ALL&query=&p=1&row=20`

| Параметр | Описание |
|----------|----------|
| `chain` | фильтр направления: `ALL`, `INPUT` (входящие), `OUTPUT` (исходящие) |
| `query` | поиск (например, номер порта) |
| `p` / `row` | страница / строк на страницу |

**Ответ (одно правило):**
```json
{
  "status": 0,
  "message": {
    "page": "<div>…Total 24…</div>",
    "shift": "0", "row": "20",
    "data": [
      {
        "Port": "8080", "Protocol": "tcp", "Family": "ipv4",
        "Strategy": "accept", "Chain": "INPUT", "Address": "all",
        "id": 6, "sid": 0, "brief": "моя заметка", "domain": "",
        "status": 0, "addtime": "2026-02-27 05:27:05"
      }
    ]
  }
}
```
| Поле | Значение |
|------|----------|
| `Port` | порт или диапазон (`8080`, `39000-40000`) |
| `Protocol` | `tcp` / `udp` |
| `Family` | `ipv4` / `ipv6` |
| `Strategy` | `accept` / `drop` |
| `Chain` | `INPUT` (входящие) / `OUTPUT` (исходящие) |
| `Address` | область источника (`all` или CIDR) |
| `brief` | заметка |
| `id` | id правила (`0` для встроенных системных портов) |
| `status` | состояние прослушивания порта (вычисляется панелью) |

---

## Операции записи (снять рецептом)

Не выполнялись на живом хосте (security-sensitive). Снимите каждую рецептом «разведка → исполнение» ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)):

- **Добавить / удалить / изменить правило порта** (кнопки «Добавить правило порта» / «Изменить» / «Удалить», под `/v2/firewall/com/…`)
- **IP-правила** (разрешить/запретить источники)
- **Проброс портов**
- **Включение/выключение firewall** и **блокировка ICMP/ping**
- **Импорт / экспорт правил**

> ⚠️ Неверное правило порта может заблокировать доступ к серверу. Всегда оставляйте открытыми порт панели и SSH (22); проверяйте новые правила сперва на некритичном высоком порту.
