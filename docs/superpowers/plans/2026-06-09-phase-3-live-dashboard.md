# Phase 3 — Live dashboard (background worker + cache + SSE) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Server statuses refresh automatically via a background worker that writes the Postgres cache, and the `/servers` table updates live in the browser (no reload) via SSE. Also populate the previously-null `disk` metric.

**Architecture (approved, spec §4 "approach B"):**
- A **separate Node worker process** (`pnpm worker`) periodically polls every server (bounded concurrency, retry/offline handling) and upserts `ServerStatus`.
- On each status write, the app emits a Postgres **`NOTIFY`**. A single **`LISTEN`** connection per Next process receives it and fans out to all open browser tabs through an in-process `EventEmitter`.
- An **SSE** route (`/api/sse/servers`) streams those events; a small client subscriber calls a **debounced `router.refresh()`** so the existing RSC query re-reads the cache (single source of truth = URL + cache; **TanStack Query stays deferred**).

**Tech Stack:** Next.js 16 (App Router, route handlers, RSC), React 19, TypeScript strict, Prisma v7, `pg` (LISTEN/NOTIFY — already a dep via the adapter), `tsx` (runs the worker; moved to dependencies), Vitest, pnpm, Node 24. **No new package** beyond relocating `tsx` to `dependencies`. No `node-cron` (a zero-dep self-scheduling loop is used).

**Reuses (do NOT reimplement):**
- `web/src/lib/aapanel` — `AaPanelClient` (`getSystemTotal`), `createClientForServer(server)`, `AaPanelError`, type `SystemTotal`.
- `web/src/lib/db/prisma.ts` → `prisma`; `web/src/env.ts` → `parseEnv()`; `web/src/log.ts` → `log` (pino).
- `web/src/lib/utils/concurrency.ts` → `mapLimit`.
- `web/src/server/actions/servers.ts` → existing actions (will be refactored to use the new status service).
- `web/src/lib/audit.ts` → `recordAudit` (manual refresh audits; the worker does NOT audit every cycle).
- vitest setup already loads `web/.env` (`test-setup.ts`) and stubs `server-only`.

**Scope (Phase 3):** worker (global poll of all servers) + `disk` + SSE live table + deploy wiring (worker service + migrations-on-start). **Deferred to Phase 4:** `projectCount` (needs project-list APIs) and faster ~3–5s polling of the actively-viewed server (needs the per-server detail route).

---

## Conventions for every task
- Branch: `feat/phase-3-live` (already created/checked out; subagents never touch `main`).
- TDD: failing test → watch fail → implement → watch pass → commit.
- Run pnpm from `web/`. Single test: `pnpm -C web test <path>`. Full gate (Task 11): `pnpm -C web test && pnpm -C web build && pnpm -C web typecheck && pnpm -C web lint`. (typecheck AFTER build for typedRoutes; **typecheck catches test-file errors that build skips**.)
- Strict TS, no `any` without reason, no swallowed errors (except documented best-effort audit), no `console.log` (worker uses pino `log`). LF endings (dev Windows / prod Ubuntu). Secrets never logged or sent to client.
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure
**Create:**
- `web/src/lib/realtime/channel.ts` — channel name constant + event type + `parseServerEvent`.
- `web/src/lib/realtime/server-events.ts` — singleton `pg` LISTEN client + EventEmitter fan-out (server-only).
- `web/src/lib/realtime/notify.ts` — `notifyServerChanged(...)` via Prisma `pg_notify` (server-only).
- `web/src/lib/servers/status.ts` — `refreshServerStatus(serverId)` shared by actions + worker (poll → upsert → notify).
- `web/src/app/api/sse/servers/route.ts` — authenticated SSE stream.
- `web/src/components/servers/servers-live.tsx` — client EventSource subscriber (debounced refresh).
- `web/src/worker/index.ts` — worker entry; `web/src/worker/poll-cycle.ts` — testable `runPollCycle`.
**Modify:**
- `web/src/lib/aapanel/{client,types,index}.ts` — add `getDiskInfo()` + `collectStatus()` + `ServerSnapshot`.
- `web/src/server/actions/servers.ts` — delegate to `lib/servers/status.ts` (remove local `pollAndUpsert`); update its test mock to `collectStatus`.
- `web/src/env.ts` — add `WORKER_CONCURRENCY`.
- `web/src/app/(app)/servers/page.tsx` — mount `<ServersLive/>`.
- `web/package.json` — `worker` script; move `tsx` to `dependencies`.
- `web/Dockerfile`, `web/docker-compose.yml`, `web/README.md` — worker service + migrate-on-start + docs.
- Docs (Task 11): spec, project-index, NAVIGATION.

---

## Task 1: aaPanel client — disk usage + combined snapshot

**Files:** modify `web/src/lib/aapanel/types.ts`, `web/src/lib/aapanel/client.ts`, `web/src/lib/aapanel/index.ts`; test `web/src/lib/aapanel/client.test.ts` (extend).

> Verify the real `GetDiskInfo` response shape against `docs/en/system-monitoring.md` and `examples/javascript/aapanel-client.ts` (`getDiskInfo`). Adapt the parsing to reality; keep the normalized return (`disk: number|null`, percent 0..100).

- [ ] **Step 1: Add failing tests** (append to `client.test.ts`)

```ts
describe('AaPanelClient.getDiskInfo', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns the root mount usage percent', async () => {
    // Adapt this fixture to the real GetDiskInfo shape from the docs/reference client.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        {path: '/', size: ['100G', '40G', '60G', '40%']},
        {path: '/boot', size: ['1G', '0.5G', '0.5G', '50%']},
      ]), {status: 200, headers: {'content-type': 'application/json'}}),
    );
    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    expect(await client.getDiskInfo()).toBeCloseTo(40);
  });

  it('returns null when no parsable mount is present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {status: 200, headers: {'content-type': 'application/json'}}),
    );
    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    expect(await client.getDiskInfo()).toBeNull();
  });
});

describe('AaPanelClient.collectStatus', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('combines system + disk; disk failure does not fail the snapshot', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({cpuRealUsed: 10, memTotal: 100, memRealUsed: 30}), {status: 200, headers: {'content-type': 'application/json'}}),
    );
    fetchMock.mockRejectedValueOnce(new TypeError('disk fetch failed'));
    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    const snap = await client.collectStatus();
    expect(snap).toMatchObject({online: true, cpu: 10, disk: null});
    expect(snap.mem).toBeCloseTo(30);
  });
});
```

- [ ] **Step 2: Run → FAIL** (`pnpm -C web test src/lib/aapanel/client.test.ts`).

- [ ] **Step 3: Implement** — in `types.ts` add:
```ts
export interface ServerSnapshot {
  online: boolean;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
}
```
In `client.ts` add (verify field shape against docs):
```ts
/** Disk usage percent of the root mount ('/'), else the first parsable mount; null if none. */
async getDiskInfo(): Promise<number | null> {
  const raw = await this.request<Array<{path?: string; size?: unknown[]}>>('GetDiskInfo');
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parsePercent = (m: {size?: unknown[]}): number | null => {
    const pct = m.size?.[3]; // aaPanel: size = [total, used, free, "40%"]
    if (typeof pct !== 'string') return null;
    const n = Number.parseFloat(pct.replace('%', ''));
    return Number.isFinite(n) ? n : null;
  };
  const root = raw.find((m) => m.path === '/');
  return parsePercent(root ?? raw[0]);
}

/** One snapshot for the cache. System metrics are required (failure ⇒ offline upstream);
 *  disk is best-effort (null on failure) so a flaky disk call never hides a healthy server. */
async collectStatus(): Promise<ServerSnapshot> {
  const sys = await this.getSystemTotal(); // throws ⇒ caller treats server as offline
  let disk: number | null = null;
  try {
    disk = await this.getDiskInfo();
  } catch {
    disk = null;
  }
  return {online: sys.online, cpu: sys.cpu, mem: sys.mem, disk};
}
```
In `index.ts` re-export the new type: add `ServerSnapshot` to the `export type {...}` line.

- [ ] **Step 4: Run → PASS**; then full `pnpm -C web test`.
- [ ] **Step 5: Commit** `feat(live): aaPanel disk usage + combined collectStatus snapshot`.

---

## Task 2: realtime channel + event parsing (pure)

**Files:** create `web/src/lib/realtime/channel.ts`; test `web/src/lib/realtime/channel.test.ts`.

- [ ] **Step 1: Failing test**
```ts
import {describe, it, expect} from 'vitest';
import {SERVER_EVENTS_CHANNEL, parseServerEvent} from './channel';

describe('parseServerEvent', () => {
  it('parses a valid payload', () => {
    expect(parseServerEvent(JSON.stringify({serverId: 'abc', online: true}))).toEqual({serverId: 'abc', online: true});
  });
  it('returns null for malformed payloads', () => {
    expect(parseServerEvent('not json')).toBeNull();
    expect(parseServerEvent(JSON.stringify({nope: 1}))).toBeNull();
  });
  it('exposes a stable channel name', () => {
    expect(SERVER_EVENTS_CHANNEL).toBe('servers_status');
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement**
```ts
export const SERVER_EVENTS_CHANNEL = 'servers_status';

export interface ServerEvent {
  serverId: string;
  online: boolean;
}

export function parseServerEvent(payload: string): ServerEvent | null {
  try {
    const v = JSON.parse(payload) as Record<string, unknown>;
    if (typeof v.serverId === 'string' && typeof v.online === 'boolean') {
      return {serverId: v.serverId, online: v.online};
    }
    return null;
  } catch {
    return null;
  }
}
```
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** `feat(live): realtime channel constant + event parser`.

---

## Task 3: NOTIFY helper (Prisma) + status service

**Files:** create `web/src/lib/realtime/notify.ts`, `web/src/lib/servers/status.ts`; test `web/src/lib/servers/status.test.ts`.

> NOTIFY goes through Prisma raw (no extra connection): `SELECT pg_notify($1,$2)`. Only LISTEN (Task 4) needs raw `pg`.

- [ ] **Step 1: Failing test** (`status.test.ts`, integration — test DB + mocked client)
```ts
import {describe, it, expect, vi, beforeEach, afterAll} from 'vitest';

vi.mock('@/lib/aapanel', async (orig) => {
  const actual = await orig<typeof import('@/lib/aapanel')>();
  return {...actual, createClientForServer: vi.fn()};
});

import {prisma} from '@/lib/db/prisma';
import {createClientForServer} from '@/lib/aapanel';
import {refreshServerStatus} from './status';

const ids: string[] = [];
beforeEach(() => {process.env.APP_ENCRYPTION_KEY = 'a'.repeat(64);});
afterAll(async () => {
  await prisma.serverStatus.deleteMany({where: {serverId: {in: ids}}});
  await prisma.server.deleteMany({where: {id: {in: ids}}});
});

const mockCollect = (snap: unknown) =>
  vi.mocked(createClientForServer).mockReturnValue({collectStatus: vi.fn(async () => snap)} as never);

describe('refreshServerStatus', () => {
  it('writes an online snapshot to the cache', async () => {
    const s = await prisma.server.create({data: {name: `st-${Date.now()}`, baseUrl: 'http://h:1', apiSkEnc: 'enc'}});
    ids.push(s.id);
    mockCollect({online: true, cpu: 11, mem: 22, disk: 33});
    const res = await refreshServerStatus(s.id);
    expect(res.ok).toBe(true);
    const st = await prisma.serverStatus.findUniqueOrThrow({where: {serverId: s.id}});
    expect(st).toMatchObject({online: true, cpu: 11, mem: 22, disk: 33, error: null});
  });

  it('writes offline + error when the client throws', async () => {
    const s = await prisma.server.create({data: {name: `st2-${Date.now()}`, baseUrl: 'http://h:1', apiSkEnc: 'enc'}});
    ids.push(s.id);
    vi.mocked(createClientForServer).mockReturnValue(
      {collectStatus: vi.fn(async () => {throw new Error('down');})} as never,
    );
    const res = await refreshServerStatus(s.id);
    expect(res.ok).toBe(false);
    const st = await prisma.serverStatus.findUniqueOrThrow({where: {serverId: s.id}});
    expect(st.online).toBe(false);
    expect(st.error).toContain('down');
  });
});
```
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** `web/src/lib/realtime/notify.ts`:
```ts
import 'server-only';
import {prisma} from '@/lib/db/prisma';
import {SERVER_EVENTS_CHANNEL, type ServerEvent} from './channel';
import {log} from '@/log';

/** Best-effort NOTIFY; a failed notify must never break the status write. */
export async function notifyServerChanged(evt: ServerEvent): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT pg_notify(${SERVER_EVENTS_CHANNEL}, ${JSON.stringify(evt)})`;
  } catch (err) {
    log.error({err, serverId: evt.serverId}, 'pg_notify failed');
  }
}
```
`web/src/lib/servers/status.ts`:
```ts
import 'server-only';
import {prisma} from '@/lib/db/prisma';
import {createClientForServer, AaPanelError} from '@/lib/aapanel';
import {notifyServerChanged} from '@/lib/realtime/notify';
import {log} from '@/log';

export interface RefreshResult {
  ok: boolean;
  online: boolean;
  message?: string;
}

function describeError(err: unknown): string {
  if (err instanceof AaPanelError) return `${err.kind}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

/** Polls one server live and writes the result to the cache; notifies listeners.
 *  Shared by manual refresh (Server Actions) and the background worker. */
export async function refreshServerStatus(serverId: string): Promise<RefreshResult> {
  const server = await prisma.server.findUniqueOrThrow({
    where: {id: serverId},
    select: {baseUrl: true, apiSkEnc: true, insecureTLS: true},
  });
  const now = new Date();
  try {
    const snap = await createClientForServer(server).collectStatus();
    await prisma.serverStatus.upsert({
      where: {serverId},
      create: {serverId, online: true, cpu: snap.cpu, mem: snap.mem, disk: snap.disk, error: null, lastCheckedAt: now},
      update: {online: true, cpu: snap.cpu, mem: snap.mem, disk: snap.disk, error: null, lastCheckedAt: now},
    });
    await notifyServerChanged({serverId, online: true});
    return {ok: true, online: true};
  } catch (err) {
    const message = describeError(err);
    await prisma.serverStatus.upsert({
      where: {serverId},
      create: {serverId, online: false, error: message, lastCheckedAt: now},
      update: {online: false, error: message, lastCheckedAt: now},
    });
    await notifyServerChanged({serverId, online: false});
    log.warn({serverId, message}, 'server poll failed');
    return {ok: false, online: false, message};
  }
}
```
- [ ] **Step 4: Run → PASS**; full `pnpm -C web test`.
- [ ] **Step 5: Commit** `feat(live): shared server status service + pg_notify`.

---

## Task 4: refactor Server Actions to use the status service

**Files:** modify `web/src/server/actions/servers.ts` + `web/src/server/actions/servers.test.ts`.

- [ ] **Step 1: Update the test mock** — the actions now reach the panel via the status service which calls `client.collectStatus()` (not `getSystemTotal`). In `servers.test.ts`, change the `@/lib/aapanel` mock so `createClientForServer` returns `{collectStatus: async () => ({online: true, cpu: 7, mem: 8, disk: 9})}`. Keep the existing assertions (`refreshServerStatusAction` → `ServerStatus.cpu === 7`).

- [ ] **Step 2: Run → the refresh test FAILS** (action still uses old `pollAndUpsert` with `getSystemTotal`).

- [ ] **Step 3: Refactor** `servers.ts`:
  - Remove the local `pollAndUpsert` function.
  - `refreshServerStatusAction(serverId)`: keep `requireUser` + empty-id guard + audit, but delegate the poll to `refreshServerStatus(serverId)` (imported from `@/lib/servers/status`). Map its result to `SimpleResult`; audit `result: ok ? 'ok' : 'error'`; `revalidatePath('/servers')`.
  - `refreshVisibleStatusesAction(ids)`: keep `requireUser` + filter/slice; replace `pollAndUpsert` with `refreshServerStatus`; `mapLimit(ids, 8, (id) => refreshServerStatus(id))`. Count `r.ok && r.value.ok`. (Note: `refreshServerStatus` resolves even on poll failure — it returns `{ok:false}` rather than throwing — so `mapLimit` settled `.ok` is about the call completing; compute `refreshed` from `value.ok`.)
  - Keep `testConnectionAction` as-is (it uses `getSystemTotal` for a quick liveness check; that still exists). Optionally switch it to `collectStatus` — NOT required; leave on `getSystemTotal`.

  Reference `refreshVisibleStatusesAction` body:
```ts
const results = await mapLimit(ids, 8, (id) => refreshServerStatus(id));
const refreshed = results.filter((r) => r.ok && r.value.ok).length;
revalidatePath('/servers');
return {ok: true, refreshed, failed: results.length - refreshed};
```

- [ ] **Step 4: Run → PASS** (`pnpm -C web test src/server/actions/servers.test.ts`), then full suite.
- [ ] **Step 5: Commit** `refactor(live): server actions delegate polling to status service`.

---

## Task 5: realtime LISTEN singleton + fan-out

**Files:** create `web/src/lib/realtime/server-events.ts`; test covers only the pure parser (Task 2) — the pg wiring is verified manually + via the worker/SSE smoke in Task 11.

- [ ] **Step 1: Implement** (server-only singleton; lazy; auto-reconnect)
```ts
import 'server-only';
import {EventEmitter} from 'node:events';
import {Client} from 'pg';
import {SERVER_EVENTS_CHANNEL, parseServerEvent, type ServerEvent} from './channel';
import {log} from '@/log';

type Globals = typeof globalThis & {__serverEvents?: ServerEventsHub};

class ServerEventsHub {
  private emitter = new EventEmitter();
  private client?: Client;
  private connecting = false;

  constructor() {
    this.emitter.setMaxListeners(0); // many SSE subscribers
  }

  private async ensureClient(): Promise<void> {
    if (this.client || this.connecting) return;
    this.connecting = true;
    try {
      const client = new Client({connectionString: process.env.DATABASE_URL});
      client.on('notification', (msg) => {
        if (!msg.payload) return;
        const evt = parseServerEvent(msg.payload);
        if (evt) this.emitter.emit('event', evt);
      });
      client.on('error', (err) => {
        log.error({err}, 'server-events LISTEN client error; will reconnect');
        this.client = undefined;
      });
      client.on('end', () => {this.client = undefined;});
      await client.connect();
      await client.query(`LISTEN ${SERVER_EVENTS_CHANNEL}`);
      this.client = client;
      log.info('server-events: LISTEN established');
    } catch (err) {
      log.error({err}, 'server-events: failed to establish LISTEN');
    } finally {
      this.connecting = false;
    }
  }

  subscribe(cb: (evt: ServerEvent) => void): () => void {
    void this.ensureClient(); // lazy connect on first subscriber; retried on next subscribe if it failed
    this.emitter.on('event', cb);
    return () => this.emitter.off('event', cb);
  }
}

function getHub(): ServerEventsHub {
  const g = globalThis as Globals;
  g.__serverEvents ??= new ServerEventsHub();
  return g.__serverEvents;
}

export function subscribeToServerEvents(cb: (evt: ServerEvent) => void): () => void {
  return getHub().subscribe(cb);
}
```
> Note: a dropped LISTEN connection clears `this.client`; the next `subscribe()` re-establishes it. For Phase 3 this is sufficient (SSE clients reconnect periodically). A timer-based reconnect can be added later if needed — call this out, don't silently assume permanence.

- [ ] **Step 2: Verify it type-checks** via `pnpm -C web build` (no unit test for the pg wiring; parser is already tested).
- [ ] **Step 3: Commit** `feat(live): Postgres LISTEN singleton with in-process fan-out`.

---

## Task 6: SSE route

**Files:** create `web/src/app/api/sse/servers/route.ts`.

- [ ] **Step 1: Implement**
```ts
import {auth} from '@/auth';
import {subscribeToServerEvents} from '@/lib/realtime/server-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEARTBEAT_MS = 25_000;

export async function GET(request: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorized', {status: 401});

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (data: string) => controller.enqueue(encoder.encode(data));
      send(': connected\n\n');
      unsubscribe = subscribeToServerEvents((evt) => send(`data: ${JSON.stringify(evt)}\n\n`));
      heartbeat = setInterval(() => send(': ping\n\n'), HEARTBEAT_MS);
      request.signal.addEventListener('abort', () => {
        unsubscribe?.();
        if (heartbeat) clearInterval(heartbeat);
        try {controller.close();} catch {/* already closed */}
      });
    },
    cancel() {
      unsubscribe?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
```
- [ ] **Step 2: Verify** `pnpm -C web build` (route compiles; appears as `/api/sse/servers`).
- [ ] **Step 3: Commit** `feat(live): authenticated SSE route for server status events`.

---

## Task 7: client live subscriber + mount

**Files:** create `web/src/components/servers/servers-live.tsx`; modify `web/src/app/(app)/servers/page.tsx`.

- [ ] **Step 1: Implement** `servers-live.tsx`
```tsx
'use client';
import {useEffect, useRef} from 'react';
import {useRouter} from 'next/navigation';

/** Subscribes to the SSE status stream and triggers a debounced RSC refresh.
 *  Renders nothing. EventSource auto-reconnects on transient errors. */
export function ServersLive() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/sse/servers');
    es.onmessage = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 1200); // coalesce bursts
    };
    return () => {
      es.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return null;
}
```
- [ ] **Step 2: Mount** in `page.tsx` — import `ServersLive` and render `<ServersLive />` once inside the returned `<section>` (e.g., right after the heading). It renders nothing but activates the live stream.
- [ ] **Step 3: Verify** `pnpm -C web build`.
- [ ] **Step 4: Commit** `feat(live): client SSE subscriber with debounced refresh`.

---

## Task 8: env + worker

**Files:** modify `web/src/env.ts`; create `web/src/worker/poll-cycle.ts`, `web/src/worker/index.ts`; modify `web/package.json`; test `web/src/worker/poll-cycle.test.ts`.

- [ ] **Step 1: env** — add to `EnvSchema`: `WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(16),`. (Keep existing `POLL_INTERVAL_MS`.)

- [ ] **Step 2: Failing test for `runPollCycle`**
```ts
import {describe, it, expect, vi} from 'vitest';
import {runPollCycle} from './poll-cycle';

describe('runPollCycle', () => {
  it('polls every id and returns online/offline counts', async () => {
    const refresh = vi.fn(async (id: string) => ({ok: id !== 'b', online: id !== 'b', message: undefined}));
    const res = await runPollCycle(['a', 'b', 'c'], 2, refresh);
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(res).toEqual({total: 3, online: 2, offline: 1});
  });
});
```
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement** `poll-cycle.ts` (injectable refresh fn → unit-testable, no DB)
```ts
import {mapLimit} from '@/lib/utils/concurrency';

export interface CycleResult {
  total: number;
  online: number;
  offline: number;
}

export type RefreshFn = (serverId: string) => Promise<{ok: boolean; online: boolean}>;

export async function runPollCycle(ids: string[], concurrency: number, refresh: RefreshFn): Promise<CycleResult> {
  const results = await mapLimit(ids, concurrency, (id) => refresh(id));
  let online = 0;
  for (const r of results) if (r.ok && r.value.online) online++;
  return {total: ids.length, online, offline: ids.length - online};
}
```
- [ ] **Step 5: Run → PASS.**

- [ ] **Step 6: Implement** `worker/index.ts` (self-scheduling, graceful shutdown)
```ts
import {parseEnv} from '@/env';
import {prisma} from '@/lib/db/prisma';
import {refreshServerStatus} from '@/lib/servers/status';
import {runPollCycle} from './poll-cycle';
import {log} from '@/log';

async function main(): Promise<void> {
  const env = parseEnv();
  log.info({interval: env.POLL_INTERVAL_MS, concurrency: env.WORKER_CONCURRENCY}, 'worker: starting');

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const servers = await prisma.server.findMany({select: {id: true}});
      const res = await runPollCycle(
        servers.map((s) => s.id),
        env.WORKER_CONCURRENCY,
        async (id) => {
          const r = await refreshServerStatus(id);
          return {ok: r.ok, online: r.online};
        },
      );
      log.info(res, 'worker: cycle complete');
    } catch (err) {
      log.error({err}, 'worker: cycle failed'); // never let one cycle kill the loop
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), env.POLL_INTERVAL_MS);
    }
  };

  const shutdown = async (sig: string): Promise<void> => {
    log.info({sig}, 'worker: shutting down');
    stopped = true;
    if (timer) clearTimeout(timer);
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await tick();
}

void main();
```
- [ ] **Step 7: package.json** — add script `"worker": "tsx src/worker/index.ts"`. Move `tsx` from `devDependencies` to `dependencies` (the prod worker runs via tsx). Keep version.

- [ ] **Step 8: Run** full `pnpm -C web test` (poll-cycle green). Optionally smoke-run the worker locally: `pnpm -C web worker` for a few seconds — it should log "cycle complete" with counts, then Ctrl-C (graceful). Report the smoke result.
- [ ] **Step 9: Commit** `feat(live): background poll worker + WORKER_CONCURRENCY env`.

---

## Task 9: deploy wiring (worker service + migrate-on-start)

**Files:** modify `web/Dockerfile`, `web/docker-compose.yml`, `web/README.md`.

> Docker is NOT installed in this environment — you cannot run compose. Make the config correct and self-consistent; verify YAML/Dockerfile syntax and that referenced scripts exist. Be explicit in the report that compose was not executed here.

- [ ] **Step 1: docker-compose** — add a `worker` service using the SAME image as `app`, command running `pnpm worker`, sharing env (`DATABASE_URL`, `APP_ENCRYPTION_KEY`, `AUTH_SECRET`, `POLL_INTERVAL_MS`, `WORKER_CONCURRENCY`), `depends_on: [postgres]`, `restart: unless-stopped`. Add a one-shot `migrate` service (same image, `command: pnpm prisma migrate deploy`, depends_on postgres) that `app` and `worker` depend on (`depends_on: {migrate: {condition: service_completed_successfully}}`), so migrations run before the app/worker boot. Keep secrets via `.env`/env, never hard-coded.

- [ ] **Step 2: Dockerfile** — ensure the worker can run from the image: `tsx` + `src/` + `prisma/` are present in the runtime stage (the standalone Next output may not include `src/`; if the image uses `output: 'standalone'`, add a stage/copy so `pnpm worker` (tsx + src) works, or document running the worker from a non-standalone copy). Keep it production-correct; if standalone makes the worker awkward, the cleanest is a small separate runtime that copies `src/worker`, `src/lib`, `src/env.ts`, `prisma/`, `node_modules` (or run `tsx` against the repo). Document the chosen approach in a comment.

- [ ] **Step 3: README** — document both deploy modes: (a) bare-metal: `pnpm build`, `pnpm prisma migrate deploy`, `pnpm start` + `pnpm worker` under pm2/systemd (give a minimal pm2/systemd snippet); (b) Docker: `docker compose up` runs migrate → app + worker + postgres. Note env vars incl. `WORKER_CONCURRENCY`.

- [ ] **Step 4: Verify** `pnpm -C web build` still succeeds; `git diff` is coherent. Report that Docker/compose was not executed locally.
- [ ] **Step 5: Commit** `chore(live): worker + migrate-on-start deploy wiring (Docker + bare-metal docs)`.

---

## Task 10: tests pass-through + edge coverage

**Files:** none new required; ensure suites green and add any missing edge test.

- [ ] **Step 1:** Run `pnpm -C web test`. Confirm all prior + new tests pass: client disk/collectStatus, channel parser, status service (online/offline), refactored actions, poll-cycle.
- [ ] **Step 2:** If `refreshVisibleStatusesAction` count logic changed, add/adjust a test asserting mixed success/failure counts (mock `refreshServerStatus` via the status-service module: `vi.mock('@/lib/servers/status', ...)`). Keep it green.
- [ ] **Step 3: Commit** any added test: `test(live): cover mixed-result visible refresh`.

---

## Task 11: full verification + docs + spec + memory

- [ ] **Step 1: Full gate** — `pnpm -C web test && pnpm -C web build && pnpm -C web typecheck && pnpm -C web lint`. All green (0 lint errors; known benign warnings ok). Fix anything that fails.
- [ ] **Step 2: Manual smoke (recommended)** — `pnpm -C web dev` in one shell, `pnpm -C web worker` in another (both read `web/.env`); open `/servers`, add a reachable test panel if available, watch the worker log cycles and the row update live without reload. Report what was observed (be honest if no live panel was available — then at least confirm the worker cycles over 0/N servers and SSE connects).
- [ ] **Step 3: Spec** — in `docs/superpowers/specs/2026-06-08-aapanel-manager-app-design.md` §15, mark Phase 3 ✅ done (worker + cache + SSE + disk + deploy/migrate); note `projectCount` and active-server fast-poll deferred to Phase 4. Reference this plan.
- [ ] **Step 4: Docs** — update `docs/project-index.md` (add worker/realtime/SSE modules to the web/ section) and `docs/NAVIGATION.md` (add Phase 3 plan link + SSE route/worker pointers).
- [ ] **Step 5: Commit** `docs(live): reconcile spec/index/navigation for Phase 3`.
- [ ] **Step 6: Final review** — dispatch a final reviewer over `git diff main...feat/phase-3-live` (focus: no secret leakage in SSE/worker logs; LISTEN/NOTIFY correctness + reconnect; worker loop never dies on a bad cycle; SSE auth + cleanup on disconnect; deploy config correctness). Then `superpowers:finishing-a-development-branch`.

---

## Self-Review (plan vs. approved design)
- **Worker = separate process** → Task 8 (`worker/index.ts`, `pnpm worker`, tsx in deps). ✅
- **LISTEN/NOTIFY + in-process fan-out** → Task 3 (NOTIFY via Prisma), Task 5 (LISTEN singleton + EventEmitter). ✅
- **SSE + debounced router.refresh()** → Task 6 (route), Task 7 (client). TanStack Query stays out. ✅
- **disk populated; projectCount + active-poll deferred** → Task 1 (disk), scope notes. ✅
- **Deploy + migrate-on-start** → Task 9. ✅
- **DRY:** one status service shared by actions + worker → Task 3–4. ✅
- **Type consistency:** `ServerSnapshot` (Task 1) consumed by status service (Task 3); `ServerEvent`/`parseServerEvent` (Task 2) used by NOTIFY (Task 3), LISTEN (Task 5), SSE (Task 6); `RefreshFn` (Task 8) matches `refreshServerStatus` shape. Checked.
- **Security:** SSE requires `auth()`; worker/SSE never log `api_sk`; status service only selects `baseUrl/apiSkEnc/insecureTLS` and decrypts server-side. ✅
- **No new package** (only `tsx` relocated). ✅

## Execution Handoff
Recommended: **subagent-driven-development** on `feat/phase-3-live`, fresh subagent per task + review, finishing with `finishing-a-development-branch`.
