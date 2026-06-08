# Firewall (Security)

[Русская версия](../ru/firewall.md) · [⌂ Home](../../README.md)

Reading the aaPanel firewall state via the API (`/v2/firewall`). Read [authentication.md](authentication.md) first.

> Examples are **real** (live v8 panel, **ufw** backend), values anonymized. `status`: `0` = success.
> ⚠️ **Scope of this page:** only the **read** endpoints are documented here (verified live). Write operations (add/remove/edit port rules, IP rules, port forwarding, toggle the firewall) change server security and were intentionally **not** executed against the live host — capture them with the discover → execute recipe ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)). Treat firewall writes with extra care: never close the panel port, SSH (22) or other access ports.

Auth paths: captured over session (`/<apsess_token>/v2/firewall/com/…`); with `api_sk` call from the panel root. Bodies are `application/x-www-form-urlencoded`.

## Methods (read)

| Action | Endpoint |
|--------|----------|
| Firewall on/off | `/v2/firewall/com/get_status` |
| Firewall summary | `/v2/firewall/com/get_firewall_info` |
| Port rules list | `/v2/firewall/com/port_rules_list` |

---

## Firewall status — `POST /v2/firewall/com/get_status`
No body.
```json
{ "status": 0, "message": { "status": true, "init_status": { "status": true, "msg": "installed." } } }
```
`message.status` = firewall enabled (`true`/`false`).

## Firewall summary — `POST /v2/firewall/com/get_firewall_info`
No body.
```json
{ "status": 0, "message": {
  "port": 24, "ip": 0, "trans": 0, "country": 0, "banned": 0,
  "type": "ufw", "update_time": "2026-06-05 16:30:09", "ping": true
}}
```
| Field | Meaning |
|-------|---------|
| `port` | number of port rules |
| `ip` | number of IP rules |
| `trans` | number of port-forwarding rules |
| `country` | number of country/region rules |
| `banned` | number of banned IPs |
| `type` | backend firewall (`ufw` here; may be `firewalld` / `iptables` on other distros) |
| `ping` | whether ICMP/ping is allowed |

## Port rules list — `POST /v2/firewall/com/port_rules_list`
Body: `chain=ALL&query=&p=1&row=20`

| Parameter | Description |
|-----------|-------------|
| `chain` | direction filter: `ALL`, `INPUT` (inbound), `OUTPUT` (outbound) |
| `query` | search (e.g. a port number) |
| `p` / `row` | page / rows per page |

**Response (one rule):**
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
        "id": 6, "sid": 0, "brief": "my note", "domain": "",
        "status": 0, "addtime": "2026-02-27 05:27:05"
      }
    ]
  }
}
```
| Field | Meaning |
|-------|---------|
| `Port` | port or range (`8080`, `39000-40000`) |
| `Protocol` | `tcp` / `udp` |
| `Family` | `ipv4` / `ipv6` |
| `Strategy` | `accept` / `drop` |
| `Chain` | `INPUT` (inbound) / `OUTPUT` (outbound) |
| `Address` | source IP scope (`all` or a CIDR) |
| `brief` | note |
| `id` | rule id (`0` for built-in system ports) |
| `status` | listen state of the port (panel-computed) |

---

## Write operations (capture via the recipe)

Not executed against the live host (security-sensitive). Capture each with the discover → execute recipe ([authentication.md](authentication.md#-the-discover--execute-recipe-aapanels-official-approach)):

- **Add / remove / edit port rule** (the "Add port rule" / "Edit" / "Delete" buttons, under `/v2/firewall/com/…`)
- **IP rules** (allow/deny source IPs)
- **Port forwarding**
- **Toggle firewall** and **ICMP/ping block**
- **Import / export rules**

> ⚠️ A wrong port rule can lock you out of the server. Always keep the panel port and SSH (22) open; test new rules on a non-critical high port first.
