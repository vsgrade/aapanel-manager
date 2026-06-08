# aaPanel Manager — web app

Next.js 16 App Router front-end + back-end proxy for managing aaPanel servers.
This is **Phase 1** (foundation): auth, server CRUD, audit log, and the two run
modes described below. The poller worker and full aaPanel API surface come in
later phases. See the spec and plan in [`docs/superpowers/`](../docs/superpowers/).

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

| Variable | How to generate |
|----------|-----------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `APP_ENCRYPTION_KEY` | `openssl rand -hex 32` |
| `SEED_ADMIN_EMAIL` | e.g. `admin@example.com` |
| `SEED_ADMIN_PASSWORD` | e.g. `changeme123` (change in prod) |

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

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm prisma migrate deploy   # applies pending migrations (no prompt)
pnpm start                   # starts Next.js production server on :3000
```

Run under **pm2** or **systemd** for process management.
The build output is a Next.js standalone bundle in `.next/standalone/`.

---

## Run mode 3 — Docker Compose

`docker-compose.yml` spins up Postgres 17 + the app in one command:

```bash
# Set POSTGRES_PASSWORD in .env (and match it in DATABASE_URL)
docker compose up --build
```

The `app` container applies pending migrations automatically on start via
`pnpm prisma migrate deploy`. See comments in `docker-compose.yml` for
Phase 3 additions (worker service, robust entrypoint).

---

## Available scripts

| Script | What it does |
|--------|-------------|
| `pnpm dev` | Start dev server (hot-reload) |
| `pnpm build` | Production build (Next.js standalone) |
| `pnpm start` | Start production server |
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
