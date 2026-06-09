# aaPanel Manager — web app

Next.js 16 App Router front-end + back-end proxy for managing aaPanel servers.
This is **Phase 1–3**: auth, server CRUD, audit log, and a background polling
worker. See the spec and plan in [`docs/superpowers/`](../docs/superpowers/).

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 24 LTS |
| pnpm | via `corepack enable` |
| PostgreSQL | 17 — **or** Docker (see below) |

---

## Environment setup

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | How to generate / notes |
|----------|-------------------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `SEED_ADMIN_EMAIL` | e.g. `admin@example.com` |
| `SEED_ADMIN_PASSWORD` | e.g. `changeme123` (change in prod) |
| `POLL_INTERVAL_MS` | Worker poll interval in ms (default: `30000`) |
| `WORKER_CONCURRENCY` | Max parallel server polls (default: `5`) |

---

## Run mode 1 — Bare-metal (development)

```bash
pnpm install
pnpm prisma migrate dev    # applies migrations + creates dev DB
pnpm prisma db seed        # seeds admin user (SEED_ADMIN_* from .env)
pnpm dev                   # starts Next.js dev server on :3000
```

Default seeded admin: `admin@example.com` / `changeme123`
(set via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` in `.env`).

---

## Run mode 2 — Bare-metal (production, Ubuntu)

The web app and the background worker are **two separate processes**.
Run each under a process manager.

```bash
pnpm install --frozen-lockfile
pnpm prisma migrate deploy   # apply pending migrations (no prompt, no seed)
pnpm build                   # Next.js standalone output → .next/standalone/
```

### Option A — pm2

Install pm2 once: `npm install -g pm2`

Create `ecosystem.config.cjs` in `web/`:

```js
// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: 'aapanel-web',
      script: 'node',
      args: 'server.js',
      cwd: '.next/standalone',
      env_file: '.env',
      // Next.js standalone ignores NODE_ENV from env_file in some versions;
      // set it explicitly here too:
      env: { NODE_ENV: 'production', PORT: '3000' },
    },
    {
      name: 'aapanel-worker',
      script: 'pnpm',
      args: 'worker',
      // Worker must run from the web/ directory (needs src/, tsconfig.worker.json)
      cwd: '.',
      env_file: '.env',
      env: { NODE_ENV: 'production' },
      // Do NOT set instances > 1 — multiple workers would double-poll every server.
      instances: 1,
      autorestart: true,
    },
  ],
};
```

```bash
pm2 start ecosystem.config.cjs
pm2 save           # persist across reboots
pm2 startup        # follow the printed command to enable on boot
```

### Option B — systemd unit for the worker

`/etc/systemd/system/aapanel-worker.service`:

```ini
[Unit]
Description=aaPanel Manager – background polling worker
After=network.target postgresql.service

[Service]
Type=simple
User=nodeapp
WorkingDirectory=/srv/aapanel/web
EnvironmentFile=/srv/aapanel/web/.env
ExecStart=/usr/bin/pnpm worker
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now aapanel-worker
sudo journalctl -fu aapanel-worker   # follow logs
```

> **Important:** run `pnpm prisma migrate deploy` before starting processes
> so the schema exists.  Re-run it on every deploy before restarting the app
> and worker.
>
> **Do not run multiple worker instances** — each instance polls every aaPanel
> server on every tick.  One instance per environment is correct.

---

## Run mode 3 — Docker Compose

`docker-compose.yml` starts four containers in the correct order:

```
postgres (health-checked)
  └─► migrate (one-shot, exits 0)
        ├─► app   (Next.js standalone, :3000)
        └─► worker (tsx poller, restart: unless-stopped)
```

```bash
# 1. Fill in DATABASE_URL, AUTH_SECRET, APP_ENCRYPTION_KEY (+ POSTGRES_PASSWORD) in .env
cp .env.example .env

# 2. Build and start everything
docker compose up --build

# Or in detached mode:
docker compose up --build -d
docker compose logs -f worker   # tail worker logs
```

### Required env vars for Docker

All values come from `.env` (via `env_file: .env` in compose).
The minimum set for production:

```
DATABASE_URL=postgresql://aapanel:<POSTGRES_PASSWORD>@postgres:5432/aapanel_manager
POSTGRES_PASSWORD=<strong password>
AUTH_SECRET=<openssl rand -base64 32>
APP_ENCRYPTION_KEY=<openssl rand -hex 32>
POLL_INTERVAL_MS=30000
WORKER_CONCURRENCY=5
```

> **Note:** the `migrate` service uses the `worker` build stage (full source +
> Prisma CLI).  The `app` service uses the `runner` build stage (Next.js
> standalone, ~3× smaller).  Both are built from the same `Dockerfile`.
>
> **Do not scale the `worker` service** (`--scale worker=2` etc.) — multiple
> replicas would poll every aaPanel server multiple times per tick.

---

## Available scripts

| Script | What it does |
|--------|-------------|
| `pnpm dev` | Start dev server (hot-reload) |
| `pnpm build` | Production build (Next.js standalone) |
| `pnpm start` | Start production server |
| `pnpm worker` | Start background polling worker |
| `pnpm lint` | Run ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Run Vitest unit/integration tests |
| `pnpm test:e2e` | Run Playwright E2E tests |

> **Important:** run `pnpm build` before `pnpm typecheck`.
> Next.js TypedRoutes generates `.next/types/` during build; `tsc --noEmit`
> needs those generated types.
>
> Recommended CI order: `pnpm build && pnpm typecheck && pnpm test`

---

## E2E tests

Playwright tests live in `e2e/`. They require a running dev server (the
`playwright.config.ts` `webServer` block starts it automatically) and a
reachable database with the seeded admin user.

```bash
pnpm test:e2e
```
