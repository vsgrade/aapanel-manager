# Phase 2 — Servers (CRUD + cached table + manual refresh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an **admin** add/edit/delete aaPanel servers (with `api_sk` encrypted at rest) and let any signed-in user view a fast, dense **servers table read from the Postgres status cache**, with **manual live refresh** of the visible rows.

**Architecture:** Server-first IA (spec §4, "approach B"). The `/servers` page is a React Server Component that reads a **page** of servers from the Postgres cache (server-side pagination/filter/sort via `searchParams`). All writes and the live "refresh" go through **Server Actions** that build a typed aaPanel client per server (decrypting `api_sk` only on the server), normalize errors, and write an `AuditLog` row. The background worker + SSE come in Phase 3; in Phase 2 the **manual refresh** is what populates `ServerStatus` (the "live visible page" hybrid).

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions), React 19 (`useActionState`/`useTransition`), TypeScript strict, Prisma v7 (PrismaPg adapter), Auth.js v5 (roles in JWT), zod 4, **@tanstack/react-table v8** (headless dense table — sort/resize/hide columns), Framer Motion (row animations), next-intl (RU/EN), shadcn/ui (base-nova), sonner (toasts), pino, Vitest + Playwright. Node 24, pnpm. `undici` (bundled with Node) for self-signed TLS.

**Reuses from Phase 1 (do NOT reimplement):**
- `web/src/lib/crypto/secret-box.ts` → `encryptSecret(plain, hexKey)`, `decryptSecret(payloadB64, hexKey)`.
- `web/src/lib/auth/guards.ts` → `AuthError`, `requireUser()`, `requireAdmin()`, `SessionUser`.
- `web/src/lib/db/prisma.ts` → `prisma`.
- `web/src/env.ts` → `parseEnv()` (env var `APP_ENCRYPTION_KEY` = 64 hex chars).
- `web/src/log.ts` → pino logger.
- i18n: messages at `web/messages/{ru,en}.json`; namespaces today: `app`, `auth`, `nav`. `getTranslations`/`useTranslations` from next-intl.
- Path alias `@/*` → `web/src/*`. shadcn config: style `base-nova`, components in `@/components/ui`.
- Reference implementation to PORT from: `examples/javascript/aapanel-client.ts` (api_sk signing + `getSystemTotal` + self-signed TLS already solved). Response field meaning: `docs/en/system-monitoring.md` and `docs/en/authentication.md`.

---

## Conventions for every task

- **Branch:** all work on `feat/phase-2-servers` (the controller creates it before Task 1; subagents never touch `main`).
- **TDD:** write the failing test first, watch it fail, implement minimally, watch it pass, then commit.
- **No secrets in client:** `apiSkEnc` and decrypted `api_sk` never cross into a Client Component, RSC payload, or log line. Server query selects explicit columns (never `apiSkEnc`).
- **Strict TS:** no `any` without justification; all action inputs validated with zod before use.
- **Run commands from `web/`.** Vitest: `pnpm test`; a single file: `pnpm test <path>`. Typecheck runs AFTER build (Next typedRoutes): `pnpm build && pnpm typecheck`.
- **Commit messages:** `feat(servers): …` / `test(servers): …` / `chore(servers): …`.

---

## File Structure (created/modified in Phase 2)

**Create — server/lib:**
- `web/src/lib/aapanel/signing.ts` — pure `sign(apiSk, requestTime)` → `{request_time, request_token}`.
- `web/src/lib/aapanel/types.ts` — `AaPanelError`, `AaPanelErrorKind`, `AaPanelClientConfig`, `SystemTotal`.
- `web/src/lib/aapanel/client.ts` — `AaPanelClient` (request + `getSystemTotal`, timeout, self-signed TLS, normalized errors).
- `web/src/lib/aapanel/index.ts` — `createClientForServer(server, hexKey)` (decrypts `apiSkEnc`).
- `web/src/lib/utils/concurrency.ts` — `mapLimit(items, limit, fn)`.
- `web/src/lib/config/secrets.ts` — `getEncryptionKey()` (reads/validates `APP_ENCRYPTION_KEY`).
- `web/src/lib/audit.ts` — `recordAudit(input)`.
- `web/src/lib/validation/server.ts` — `serverCreateSchema`, `serverUpdateSchema`, `serverListParamsSchema`, `testConnectionSchema`, derived types.
- `web/src/lib/servers/query.ts` — `listServers(params)` → `{rows, total}`; `ServerRow` type.
- `web/src/server/actions/servers.ts` — `'use server'`: `createServerAction`, `updateServerAction`, `deleteServerAction`, `testConnectionAction`, `refreshServerStatusAction`, `refreshVisibleStatusesAction`, `ActionState`.

**Create — UI:**
- `web/src/app/(app)/servers/page.tsx`, `loading.tsx`, `error.tsx`.
- `web/src/components/servers/servers-table.tsx` (client), `columns.tsx`, `servers-toolbar.tsx` (client), `server-form-dialog.tsx` (client), `delete-server-dialog.tsx` (client), `status-badge.tsx`.
- shadcn UI to add: `table`, `dialog`, `dropdown-menu`, `select`, `badge`, `checkbox`, `switch` (button/input/label already present).

**Modify:**
- `web/src/app/(app)/page.tsx` → `redirect('/servers')`.
- `web/src/components/app-shell.tsx` → nav link to `/servers`.
- `web/messages/ru.json`, `web/messages/en.json` → add `servers` namespace + extend `nav`.
- `web/package.json` → add `@tanstack/react-table` (v8).
- `web/e2e/servers.spec.ts` (create) — e2e flow.
- Docs (final task): `docs/superpowers/specs/2026-06-08-aapanel-manager-app-design.md` (stack reconciliation note), `docs/project-index.md`, `docs/NAVIGATION.md`.

---

## Task 1: aaPanel client — request signing (pure)

**Files:**
- Create: `web/src/lib/aapanel/signing.ts`
- Test: `web/src/lib/aapanel/signing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/aapanel/signing.test.ts
import {describe, it, expect} from 'vitest';
import {createHash} from 'node:crypto';
import {sign} from './signing';

const md5 = (s: string) => createHash('md5').update(s).digest('hex');

describe('sign', () => {
  it('builds request_token = md5(request_time + md5(api_sk)) for a fixed time', () => {
    const requestTime = 1_700_000_000;
    const apiSk = 'test_api_sk_value';
    const out = sign(apiSk, requestTime);
    expect(out.request_time).toBe(String(requestTime));
    expect(out.request_token).toBe(md5(String(requestTime) + md5(apiSk)));
  });

  it('is deterministic for the same inputs and changes with time', () => {
    expect(sign('k', 1).request_token).toBe(sign('k', 1).request_token);
    expect(sign('k', 1).request_token).not.toBe(sign('k', 2).request_token);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/aapanel/signing.test.ts`
Expected: FAIL — `sign` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// web/src/lib/aapanel/signing.ts
import {createHash} from 'node:crypto';

const md5 = (input: string): string => createHash('md5').update(input).digest('hex');

export interface SignedAuth {
  request_time: string;
  request_token: string;
}

/**
 * aaPanel api_sk signature: request_token = md5(request_time + md5(api_sk)).
 * `requestTime` is UNIX seconds. Pass it in so the function stays pure/testable.
 */
export function sign(apiSk: string, requestTime: number): SignedAuth {
  const rt = String(requestTime);
  return {request_time: rt, request_token: md5(rt + md5(apiSk))};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/aapanel/signing.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/aapanel/signing.ts web/src/lib/aapanel/signing.test.ts
git commit -m "feat(servers): aaPanel api_sk request signing"
```

---

## Task 2: aaPanel client — types + client (request, getSystemTotal, TLS, errors)

**Files:**
- Create: `web/src/lib/aapanel/types.ts`, `web/src/lib/aapanel/client.ts`
- Test: `web/src/lib/aapanel/client.test.ts`

> **Port reference:** `examples/javascript/aapanel-client.ts` already implements api_sk auth, `getSystemTotal`, and self-signed TLS against the live panel. Match its endpoint path and response mapping. For api_sk mode the request is a POST to `` `${baseUrl}/system?action=GetSystemTotal` `` with `application/x-www-form-urlencoded` body containing `request_time` + `request_token`. Self-signed TLS uses an `undici` `Agent` with `connect.rejectUnauthorized=false`, passed as the non-standard `dispatcher` fetch option (Node runtime only).

- [ ] **Step 1: Write the failing test** (mock global fetch; no network)

```ts
// web/src/lib/aapanel/client.test.ts
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {AaPanelClient} from './client';
import {AaPanelError} from './types';

const cfg = {baseUrl: 'https://panel.example:8888', apiSk: 'k', insecureTLS: true, timeoutMs: 1000};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

describe('AaPanelClient.getSystemTotal', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('maps a healthy response to normalized metrics', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({cpuRealUsed: 12.5, memTotal: 1000, memRealUsed: 250}),
    );
    const client = new AaPanelClient(cfg);
    const out = await client.getSystemTotal();
    expect(out.online).toBe(true);
    expect(out.cpu).toBeCloseTo(12.5);
    expect(out.mem).toBeCloseTo(25); // 250/1000 * 100
    // signed fields present in the request body
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('request_time=');
    expect(body).toContain('request_token=');
  });

  it('classifies HTTP 401 as an auth error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({msg: 'bad key'}, 401));
    const client = new AaPanelClient(cfg);
    await expect(client.getSystemTotal()).rejects.toMatchObject({kind: 'auth'} satisfies Partial<AaPanelError>);
  });

  it('classifies a thrown fetch as a network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('connect ECONNREFUSED'));
    const client = new AaPanelClient(cfg);
    await expect(client.getSystemTotal()).rejects.toMatchObject({kind: 'network'});
  });

  it('classifies an AbortError as a timeout', async () => {
    const err = Object.assign(new Error('aborted'), {name: 'AbortError'});
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(err);
    const client = new AaPanelClient(cfg);
    await expect(client.getSystemTotal()).rejects.toMatchObject({kind: 'timeout'});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/aapanel/client.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the types**

```ts
// web/src/lib/aapanel/types.ts
export type AaPanelErrorKind = 'network' | 'timeout' | 'auth' | 'panel_error';

export class AaPanelError extends Error {
  constructor(
    public readonly kind: AaPanelErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'AaPanelError';
  }
}

export interface AaPanelClientConfig {
  baseUrl: string;
  apiSk: string;
  insecureTLS?: boolean;
  timeoutMs?: number;
}

/** Normalized server metrics for the status cache. Nulls when not derivable. */
export interface SystemTotal {
  online: boolean;
  cpu: number | null; // percent 0..100
  mem: number | null; // percent 0..100
}
```

- [ ] **Step 4: Write the client**

```ts
// web/src/lib/aapanel/client.ts
import {Agent} from 'undici';
import {sign} from './signing';
import {AaPanelError, type AaPanelClientConfig, type SystemTotal} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;

// One reusable dispatcher for self-signed panels (avoid per-call allocation).
const insecureDispatcher = new Agent({connect: {rejectUnauthorized: false}});

type FetchInit = RequestInit & {dispatcher?: unknown};

export class AaPanelClient {
  private readonly baseUrl: string;
  private readonly apiSk: string;
  private readonly insecureTLS: boolean;
  private readonly timeoutMs: number;

  constructor(config: AaPanelClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiSk = config.apiSk;
    this.insecureTLS = config.insecureTLS ?? true;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  /** POST an api_sk-signed form request to /system?action=<action>. */
  private async request<T>(action: string, extra: Record<string, string> = {}): Promise<T> {
    const auth = sign(this.apiSk, Math.floor(Date.now() / 1000));
    const body = new URLSearchParams({...auth, ...extra});
    const url = `${this.baseUrl}/system?action=${encodeURIComponent(action)}`;

    let res: Response;
    try {
      const init: FetchInit = {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: body.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      };
      if (this.insecureTLS) init.dispatcher = insecureDispatcher;
      res = await fetch(url, init as RequestInit);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AaPanelError('timeout', `Request to ${action} timed out`);
      }
      throw new AaPanelError('network', err instanceof Error ? err.message : 'Network error');
    }

    if (res.status === 401 || res.status === 403) {
      throw new AaPanelError('auth', `Authentication failed (${res.status})`, res.status);
    }
    if (!res.ok) {
      throw new AaPanelError('panel_error', `Panel returned HTTP ${res.status}`, res.status);
    }
    try {
      return (await res.json()) as T;
    } catch {
      throw new AaPanelError('panel_error', 'Panel returned a non-JSON response', res.status);
    }
  }

  /** Liveness + basic metrics. Disk/projectCount are filled by the worker (Phase 3/4). */
  async getSystemTotal(): Promise<SystemTotal> {
    const raw = await this.request<{cpuRealUsed?: number; memTotal?: number; memRealUsed?: number}>(
      'GetSystemTotal',
    );
    const cpu = typeof raw.cpuRealUsed === 'number' ? raw.cpuRealUsed : null;
    const mem =
      typeof raw.memTotal === 'number' && raw.memTotal > 0 && typeof raw.memRealUsed === 'number'
        ? (raw.memRealUsed / raw.memTotal) * 100
        : null;
    return {online: true, cpu, mem};
  }
}
```

> **Implementer note:** Verify the exact `GetSystemTotal` JSON keys against `docs/en/system-monitoring.md` and `examples/javascript/aapanel-client.ts`. If the live keys differ (e.g. `cpu` is an array), adapt the mapping in `getSystemTotal` and the test fixture together — keep the normalized `SystemTotal` shape stable.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/lib/aapanel/client.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/aapanel/types.ts web/src/lib/aapanel/client.ts web/src/lib/aapanel/client.test.ts
git commit -m "feat(servers): typed aaPanel client (getSystemTotal, TLS, normalized errors)"
```

---

## Task 3: Encryption-key accessor + client factory

**Files:**
- Create: `web/src/lib/config/secrets.ts`, `web/src/lib/aapanel/index.ts`
- Test: `web/src/lib/config/secrets.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/config/secrets.test.ts
import {describe, it, expect, afterEach} from 'vitest';
import {getEncryptionKey} from './secrets';

const VALID = 'a'.repeat(64);

describe('getEncryptionKey', () => {
  const original = process.env.APP_ENCRYPTION_KEY;
  afterEach(() => {process.env.APP_ENCRYPTION_KEY = original;});

  it('returns the key when it is 64 hex chars', () => {
    process.env.APP_ENCRYPTION_KEY = VALID;
    expect(getEncryptionKey()).toBe(VALID);
  });

  it('throws when missing or malformed', () => {
    delete process.env.APP_ENCRYPTION_KEY;
    expect(() => getEncryptionKey()).toThrow();
    process.env.APP_ENCRYPTION_KEY = 'short';
    expect(() => getEncryptionKey()).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/config/secrets.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement accessor + factory**

```ts
// web/src/lib/config/secrets.ts
import 'server-only';

/** Reads and validates the AES key. Throws (never returns an invalid key). */
export function getEncryptionKey(): string {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error('APP_ENCRYPTION_KEY must be 64 hex chars (32 bytes)');
  }
  return key;
}
```

```ts
// web/src/lib/aapanel/index.ts
import 'server-only';
import {decryptSecret} from '@/lib/crypto/secret-box';
import {getEncryptionKey} from '@/lib/config/secrets';
import {AaPanelClient} from './client';

export interface ServerCreds {
  baseUrl: string;
  apiSkEnc: string;
  insecureTLS: boolean;
}

/** Builds a client for a stored server by decrypting its api_sk (server-only). */
export function createClientForServer(server: ServerCreds): AaPanelClient {
  const apiSk = decryptSecret(server.apiSkEnc, getEncryptionKey());
  return new AaPanelClient({baseUrl: server.baseUrl, apiSk, insecureTLS: server.insecureTLS});
}

export {AaPanelClient} from './client';
export {AaPanelError} from './types';
export type {SystemTotal, AaPanelErrorKind} from './types';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/config/secrets.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/config/secrets.ts web/src/lib/config/secrets.test.ts web/src/lib/aapanel/index.ts
git commit -m "feat(servers): encryption-key accessor and per-server client factory"
```

---

## Task 4: `mapLimit` concurrency helper

**Files:**
- Create: `web/src/lib/utils/concurrency.ts`
- Test: `web/src/lib/utils/concurrency.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/utils/concurrency.test.ts
import {describe, it, expect} from 'vitest';
import {mapLimit} from './concurrency';

describe('mapLimit', () => {
  it('preserves input order in the results', async () => {
    const out = await mapLimit([1, 2, 3, 4], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    await mapLimit([...Array(10).keys()], 3, async () => {
      active++; peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('isolates rejections per item via allSettled-style result', async () => {
    const out = await mapLimit([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });
    expect(out[0]).toEqual({ok: true, value: 1});
    expect(out[1]).toEqual({ok: false, error: expect.any(Error)});
    expect(out[2]).toEqual({ok: true, value: 3});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/utils/concurrency.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/utils/concurrency.ts
export type Settled<T> = {ok: true; value: T} | {ok: false; error: Error};

/**
 * Maps over `items` running at most `limit` tasks at once, preserving order.
 * Per-item failures are captured (allSettled-style) so one bad server never
 * fails the whole batch.
 */
export async function mapLimit<I, O>(
  items: readonly I[],
  limit: number,
  fn: (item: I, index: number) => Promise<O>,
): Promise<Array<Settled<O>>> {
  const results = new Array<Settled<O>>(items.length);
  let cursor = 0;
  const size = Math.max(1, Math.min(limit, items.length || 1));

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = {ok: true, value: await fn(items[i], i)};
      } catch (err) {
        results[i] = {ok: false, error: err instanceof Error ? err : new Error(String(err))};
      }
    }
  }

  await Promise.all(Array.from({length: size}, () => worker()));
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/utils/concurrency.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/utils/concurrency.ts web/src/lib/utils/concurrency.test.ts
git commit -m "feat(servers): mapLimit bounded-concurrency helper"
```

---

## Task 5: Validation schemas (server CRUD + list params)

**Files:**
- Create: `web/src/lib/validation/server.ts`
- Test: `web/src/lib/validation/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/validation/server.test.ts
import {describe, it, expect} from 'vitest';
import {serverCreateSchema, serverListParamsSchema} from './server';

describe('serverCreateSchema', () => {
  it('accepts a valid server', () => {
    const r = serverCreateSchema.safeParse({
      name: 'Prod-1', baseUrl: 'https://1.2.3.4:8888', apiSk: 'x'.repeat(16), tag: 'eu', insecureTLS: 'true',
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.insecureTLS).toBe(true);
  });

  it('rejects non-http(s) URLs and short api_sk', () => {
    expect(serverCreateSchema.safeParse({name: 'a', baseUrl: 'ftp://x', apiSk: 'x'.repeat(16)}).success).toBe(false);
    expect(serverCreateSchema.safeParse({name: 'a', baseUrl: 'https://x:1', apiSk: 'short'}).success).toBe(false);
  });

  it('coerces empty tag to undefined', () => {
    const r = serverCreateSchema.safeParse({name: 'a', baseUrl: 'http://h:1', apiSk: 'x'.repeat(16), tag: ''});
    expect(r.success && r.data.tag).toBeUndefined();
  });
});

describe('serverListParamsSchema', () => {
  it('applies defaults', () => {
    const r = serverListParamsSchema.parse({});
    expect(r).toMatchObject({page: 1, pageSize: 25, status: 'all', sort: 'name', dir: 'asc'});
  });
  it('clamps/validates page size and enums', () => {
    expect(serverListParamsSchema.parse({pageSize: '999'}).pageSize).toBe(100);
    expect(serverListParamsSchema.safeParse({sort: 'pwned'}).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/validation/server.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement schemas**

```ts
// web/src/lib/validation/server.ts
import {z} from 'zod';

const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => {
    try {return ['http:', 'https:'].includes(new URL(u).protocol);} catch {return false;}
  }, 'Must be an http(s) URL');

const optionalTag = z
  .string()
  .trim()
  .max(50)
  .optional()
  .transform((v) => (v === '' || v == null ? undefined : v));

const apiSk = z.string().trim().min(16, 'api_sk looks too short').max(200);

export const serverCreateSchema = z.object({
  name: z.string().trim().min(1).max(100),
  baseUrl: httpUrl,
  apiSk,
  tag: optionalTag,
  insecureTLS: z.coerce.boolean().default(true),
});

export const serverUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  baseUrl: httpUrl,
  apiSk: apiSk.optional().or(z.literal('').transform(() => undefined)), // blank = keep existing
  tag: optionalTag,
  insecureTLS: z.coerce.boolean().default(true),
});

export const testConnectionSchema = z.object({
  id: z.string().min(1).optional(), // present when testing an existing server with blank api_sk
  baseUrl: httpUrl,
  apiSk: apiSk.optional().or(z.literal('').transform(() => undefined)),
  insecureTLS: z.coerce.boolean().default(true),
});

export const serverListParamsSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1).default(1),
  pageSize: z.coerce.number().int().min(5).max(100).catch(25).default(25),
  q: z.string().trim().max(100).optional(),
  status: z.enum(['all', 'online', 'offline', 'unknown']).catch('all').default('all'),
  tag: z.string().trim().max(50).optional(),
  sort: z.enum(['name', 'tag', 'createdAt', 'lastCheckedAt', 'cpu', 'mem']).catch('name').default('name'),
  dir: z.enum(['asc', 'desc']).catch('asc').default('asc'),
});

export type ServerCreateInput = z.infer<typeof serverCreateSchema>;
export type ServerUpdateInput = z.infer<typeof serverUpdateSchema>;
export type ServerListParams = z.infer<typeof serverListParamsSchema>;
```

> Note: `serverListParamsSchema` uses `.catch(...)` so malformed URL params fall back to safe defaults instead of throwing on the page (resilient to hand-edited URLs). `serverCreateSchema`/`serverUpdateSchema` do NOT use `.catch` — bad form input must surface as field errors.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/validation/server.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/validation/server.ts web/src/lib/validation/server.test.ts
git commit -m "feat(servers): zod schemas for server CRUD and list params"
```

---

## Task 6: Audit helper

**Files:**
- Create: `web/src/lib/audit.ts`
- Test: `web/src/lib/audit.test.ts` (integration — uses the test DB via `prisma`)

> The test DB is the remote Postgres in `web/.env` (`DATABASE_URL`). Tests must clean up their own rows.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/audit.test.ts
import {describe, it, expect, afterAll} from 'vitest';
import {prisma} from '@/lib/db/prisma';
import {recordAudit} from './audit';

const createdIds: string[] = [];

afterAll(async () => {
  if (createdIds.length) await prisma.auditLog.deleteMany({where: {id: {in: createdIds}}});
});

describe('recordAudit', () => {
  it('persists an audit row and returns it', async () => {
    const row = await recordAudit({action: 'server.test', result: 'ok', target: 'unit'});
    createdIds.push(row.id);
    expect(row.action).toBe('server.test');
    expect(row.result).toBe('ok');
  });

  it('never throws even if the write fails (audit is best-effort)', async () => {
    // userId references a non-existent user → FK violation, must be swallowed
    await expect(recordAudit({action: 'x', result: 'ok', userId: 'definitely-missing'})).resolves.toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/audit.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/audit.ts
import 'server-only';
import type {AuditLog} from '@prisma/client';
import {prisma} from '@/lib/db/prisma';
import {logger} from '@/log';

export interface AuditInput {
  action: string;
  result: 'ok' | 'error' | string;
  userId?: string;
  serverId?: string;
  target?: string;
}

/** Best-effort audit write. Returns the row, or null if persistence failed. */
export async function recordAudit(input: AuditInput): Promise<AuditLog | null> {
  try {
    return await prisma.auditLog.create({data: input});
  } catch (err) {
    logger.error({err, action: input.action}, 'failed to write audit log');
    return null;
  }
}
```

> Implementer: confirm the pino export name in `web/src/log.ts` (`logger` vs default). Adjust the import to match.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/audit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/audit.ts web/src/lib/audit.test.ts
git commit -m "feat(servers): best-effort audit log helper"
```

---

## Task 7: `listServers` cache query (server-side pagination/filter/sort)

**Files:**
- Create: `web/src/lib/servers/query.ts`
- Test: `web/src/lib/servers/query.test.ts` (integration — test DB)

- [ ] **Step 1: Write the failing test**

```ts
// web/src/lib/servers/query.test.ts
import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {prisma} from '@/lib/db/prisma';
import {listServers} from './query';
import {serverListParamsSchema} from '@/lib/validation/server';

const ids: string[] = [];

beforeAll(async () => {
  for (const [name, tag] of [['q-alpha', 'eu'], ['q-bravo', 'us'], ['q-charlie', 'eu']] as const) {
    const s = await prisma.server.create({data: {name, tag, baseUrl: 'http://h:1', apiSkEnc: 'enc'}});
    ids.push(s.id);
  }
  await prisma.serverStatus.create({data: {serverId: ids[0], online: true, cpu: 5, mem: 10}});
});

afterAll(async () => {
  await prisma.serverStatus.deleteMany({where: {serverId: {in: ids}}});
  await prisma.server.deleteMany({where: {id: {in: ids}}});
});

describe('listServers', () => {
  it('filters by search term and never leaks apiSkEnc', async () => {
    const {rows, total} = await listServers(serverListParamsSchema.parse({q: 'q-alpha'}));
    expect(total).toBe(1);
    expect(rows[0].name).toBe('q-alpha');
    expect((rows[0] as Record<string, unknown>).apiSkEnc).toBeUndefined();
  });

  it('filters by tag and paginates', async () => {
    const {rows, total} = await listServers(serverListParamsSchema.parse({tag: 'eu', pageSize: 1, page: 1}));
    expect(total).toBe(2);
    expect(rows).toHaveLength(1);
  });

  it('filters by status=unknown (no status row)', async () => {
    const {rows} = await listServers(serverListParamsSchema.parse({status: 'unknown', tag: 'eu'}));
    expect(rows.every((r) => r.online === null)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/servers/query.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// web/src/lib/servers/query.ts
import 'server-only';
import type {Prisma} from '@prisma/client';
import {prisma} from '@/lib/db/prisma';
import type {ServerListParams} from '@/lib/validation/server';

export interface ServerRow {
  id: string;
  name: string;
  tag: string | null;
  baseUrl: string;
  insecureTLS: boolean;
  createdAt: Date;
  online: boolean | null;
  cpu: number | null;
  mem: number | null;
  disk: number | null;
  projectCount: number | null;
  error: string | null;
  lastCheckedAt: Date | null;
}

export interface ListServersResult {
  rows: ServerRow[];
  total: number;
}

function buildWhere(p: ServerListParams): Prisma.ServerWhereInput {
  const where: Prisma.ServerWhereInput = {};
  if (p.q) {
    where.OR = [
      {name: {contains: p.q, mode: 'insensitive'}},
      {baseUrl: {contains: p.q, mode: 'insensitive'}},
      {tag: {contains: p.q, mode: 'insensitive'}},
    ];
  }
  if (p.tag) where.tag = p.tag;
  if (p.status === 'online') where.status = {is: {online: true}};
  else if (p.status === 'offline') where.status = {is: {online: false}};
  else if (p.status === 'unknown') where.status = {is: null};
  return where;
}

function buildOrderBy(p: ServerListParams): Prisma.ServerOrderByWithRelationInput {
  switch (p.sort) {
    case 'cpu': return {status: {cpu: p.dir}};
    case 'mem': return {status: {mem: p.dir}};
    case 'lastCheckedAt': return {status: {lastCheckedAt: p.dir}};
    case 'tag': return {tag: p.dir};
    case 'createdAt': return {createdAt: p.dir};
    default: return {name: p.dir};
  }
}

export async function listServers(p: ServerListParams): Promise<ListServersResult> {
  const where = buildWhere(p);
  const [records, total] = await Promise.all([
    prisma.server.findMany({
      where,
      orderBy: buildOrderBy(p),
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      // Explicit select — apiSkEnc is intentionally excluded.
      select: {
        id: true, name: true, tag: true, baseUrl: true, insecureTLS: true, createdAt: true,
        status: {select: {online: true, cpu: true, mem: true, disk: true, projectCount: true, error: true, lastCheckedAt: true}},
      },
    }),
    prisma.server.count({where}),
  ]);

  const rows: ServerRow[] = records.map((r) => ({
    id: r.id, name: r.name, tag: r.tag, baseUrl: r.baseUrl, insecureTLS: r.insecureTLS, createdAt: r.createdAt,
    online: r.status?.online ?? null,
    cpu: r.status?.cpu ?? null,
    mem: r.status?.mem ?? null,
    disk: r.status?.disk ?? null,
    projectCount: r.status?.projectCount ?? null,
    error: r.status?.error ?? null,
    lastCheckedAt: r.status?.lastCheckedAt ?? null,
  }));
  return {rows, total};
}
```

> Note on `status: {is: {online: false}}`: this matches servers whose status row exists and is offline. Servers never checked (no row) are `unknown`, not `offline` — matching the UI's three states.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/lib/servers/query.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/servers/query.ts web/src/lib/servers/query.test.ts
git commit -m "feat(servers): cached server list query (filter/sort/paginate, no secret leak)"
```

---

## Task 8: Server Actions (CRUD + testConnection + refresh)

**Files:**
- Create: `web/src/server/actions/servers.ts`
- Test: `web/src/server/actions/servers.test.ts` (integration — test DB + mocked aaPanel client + mocked guards)

- [ ] **Step 1: Write the failing test**

```ts
// web/src/server/actions/servers.test.ts
import {describe, it, expect, vi, beforeEach, afterAll} from 'vitest';

// Mock auth guards so we control the acting user/role.
const guard = vi.hoisted(() => ({user: {id: '', email: 'a@b.c', role: 'admin' as 'admin' | 'viewer'}}));
vi.mock('@/lib/auth/guards', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/guards')>();
  return {
    ...actual,
    requireUser: vi.fn(async () => guard.user),
    requireAdmin: vi.fn(async () => {
      if (guard.user.role !== 'admin') throw new actual.AuthError('forbidden');
      return guard.user;
    }),
  };
});
// Mock the panel client so no network is hit.
vi.mock('@/lib/aapanel', async (orig) => {
  const actual = await orig<typeof import('@/lib/aapanel')>();
  return {...actual, createClientForServer: vi.fn(() => ({getSystemTotal: async () => ({online: true, cpu: 7, mem: 8})}))};
});
// Next cache no-op
vi.mock('next/cache', () => ({revalidatePath: vi.fn()}));

import {prisma} from '@/lib/db/prisma';
import {decryptSecret} from '@/lib/crypto/secret-box';
import {createServerAction, deleteServerAction, refreshServerStatusAction} from './servers';

const KEY = 'a'.repeat(64);
const cleanupServerIds: string[] = [];
let userId = '';

beforeEach(async () => {
  process.env.APP_ENCRYPTION_KEY = KEY;
  guard.user.role = 'admin';
  if (!userId) {
    const u = await prisma.user.create({data: {email: `actor-${Date.now()}@t.c`, passwordHash: 'x', role: 'admin'}});
    userId = u.id; guard.user.id = u.id;
  }
});

afterAll(async () => {
  await prisma.server.deleteMany({where: {id: {in: cleanupServerIds}}});
  if (userId) await prisma.user.delete({where: {id: userId}}).catch(() => {});
});

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

describe('createServerAction', () => {
  it('stores the api_sk encrypted (round-trips) and returns ok', async () => {
    const state = await createServerAction({ok: false, error: ''}, fd({
      name: 'Act-1', baseUrl: 'https://1.2.3.4:8888', apiSk: 'k'.repeat(16), insecureTLS: 'true',
    }));
    expect(state.ok).toBe(true);
    const row = await prisma.server.findFirstOrThrow({where: {name: 'Act-1'}});
    cleanupServerIds.push(row.id);
    expect(row.apiSkEnc).not.toContain('k'.repeat(16));
    expect(decryptSecret(row.apiSkEnc, KEY)).toBe('k'.repeat(16));
  });

  it('returns field errors on invalid input', async () => {
    const state = await createServerAction({ok: false, error: ''}, fd({name: '', baseUrl: 'nope', apiSk: 'x'}));
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.fieldErrors?.baseUrl).toBeTruthy();
  });

  it('forbids a viewer from creating', async () => {
    guard.user.role = 'viewer';
    const state = await createServerAction({ok: false, error: ''}, fd({
      name: 'Nope', baseUrl: 'https://h:1', apiSk: 'k'.repeat(16),
    }));
    expect(state.ok).toBe(false);
  });
});

describe('refreshServerStatusAction', () => {
  it('upserts a ServerStatus from the panel client', async () => {
    const s = await prisma.server.create({data: {name: 'Ref-1', baseUrl: 'http://h:1', apiSkEnc: 'enc'}});
    cleanupServerIds.push(s.id);
    const res = await refreshServerStatusAction(s.id);
    expect(res.ok).toBe(true);
    const st = await prisma.serverStatus.findUniqueOrThrow({where: {serverId: s.id}});
    expect(st.online).toBe(true);
    expect(st.cpu).toBe(7);
  });
});

describe('deleteServerAction', () => {
  it('deletes a server (cascades status)', async () => {
    const s = await prisma.server.create({data: {name: 'Del-1', baseUrl: 'http://h:1', apiSkEnc: 'enc'}});
    await deleteServerAction(fd({id: s.id}));
    expect(await prisma.server.findUnique({where: {id: s.id}})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/server/actions/servers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the actions**

```ts
// web/src/server/actions/servers.ts
'use server';
import {revalidatePath} from 'next/cache';
import {requireUser, requireAdmin, AuthError} from '@/lib/auth/guards';
import {encryptSecret} from '@/lib/crypto/secret-box';
import {getEncryptionKey} from '@/lib/config/secrets';
import {createClientForServer, AaPanelError} from '@/lib/aapanel';
import {recordAudit} from '@/lib/audit';
import {mapLimit} from '@/lib/utils/concurrency';
import {prisma} from '@/lib/db/prisma';
import {logger} from '@/log';
import {serverCreateSchema, serverUpdateSchema, testConnectionSchema} from '@/lib/validation/server';

export type ActionState =
  | {ok: true; message?: string}
  | {ok: false; error: string; fieldErrors?: Record<string, string[]>};

export interface SimpleResult {
  ok: boolean;
  message: string;
}

function fieldErrorState(error: string, fieldErrors?: Record<string, string[]>): ActionState {
  return {ok: false, error, fieldErrors};
}

function describeError(err: unknown): string {
  if (err instanceof AaPanelError) return `${err.kind}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export async function createServerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {user = await requireAdmin();} catch (e) {
    return fieldErrorState(e instanceof AuthError ? e.code : 'forbidden');
  }
  const parsed = serverCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorState('validation', parsed.error.flatten().fieldErrors);

  const {name, baseUrl, apiSk, tag, insecureTLS} = parsed.data;
  try {
    const apiSkEnc = encryptSecret(apiSk, getEncryptionKey());
    const server = await prisma.server.create({data: {name, baseUrl, apiSkEnc, tag, insecureTLS}});
    await recordAudit({userId: user.id, serverId: server.id, action: 'server.create', target: name, result: 'ok'});
    revalidatePath('/servers');
    return {ok: true, message: 'created'};
  } catch (err) {
    logger.error({err}, 'createServerAction failed');
    await recordAudit({userId: user.id, action: 'server.create', target: name, result: 'error'});
    return fieldErrorState(describeError(err));
  }
}

export async function updateServerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user;
  try {user = await requireAdmin();} catch (e) {
    return fieldErrorState(e instanceof AuthError ? e.code : 'forbidden');
  }
  const parsed = serverUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorState('validation', parsed.error.flatten().fieldErrors);

  const {id, name, baseUrl, apiSk, tag, insecureTLS} = parsed.data;
  try {
    const data: Record<string, unknown> = {name, baseUrl, tag, insecureTLS};
    if (apiSk) data.apiSkEnc = encryptSecret(apiSk, getEncryptionKey()); // blank = keep existing
    await prisma.server.update({where: {id}, data});
    await recordAudit({userId: user.id, serverId: id, action: 'server.update', target: name, result: 'ok'});
    revalidatePath('/servers');
    return {ok: true, message: 'updated'};
  } catch (err) {
    logger.error({err, id}, 'updateServerAction failed');
    await recordAudit({userId: user.id, serverId: id, action: 'server.update', target: name, result: 'error'});
    return fieldErrorState(describeError(err));
  }
}

export async function deleteServerAction(formData: FormData): Promise<SimpleResult> {
  let user;
  try {user = await requireAdmin();} catch {return {ok: false, message: 'forbidden'};}
  const id = String(formData.get('id') ?? '');
  if (!id) return {ok: false, message: 'missing id'};
  try {
    const server = await prisma.server.delete({where: {id}}); // ServerStatus cascades
    await recordAudit({userId: user.id, serverId: id, action: 'server.delete', target: server.name, result: 'ok'});
    revalidatePath('/servers');
    return {ok: true, message: 'deleted'};
  } catch (err) {
    logger.error({err, id}, 'deleteServerAction failed');
    return {ok: false, message: describeError(err)};
  }
}

/** Tests connectivity for a (possibly unsaved) server. Read-only on the panel. */
export async function testConnectionAction(formData: FormData): Promise<SimpleResult> {
  try {await requireAdmin();} catch {return {ok: false, message: 'forbidden'};}
  const parsed = testConnectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return {ok: false, message: 'validation'};
  const {id, baseUrl, apiSk, insecureTLS} = parsed.data;

  try {
    let apiSkEnc: string;
    if (apiSk) apiSkEnc = encryptSecret(apiSk, getEncryptionKey());
    else if (id) {
      const existing = await prisma.server.findUniqueOrThrow({where: {id}, select: {apiSkEnc: true}});
      apiSkEnc = existing.apiSkEnc;
    } else return {ok: false, message: 'api_sk required'};

    const client = createClientForServer({baseUrl, apiSkEnc, insecureTLS});
    const total = await client.getSystemTotal();
    return {ok: true, message: `online · cpu ${total.cpu ?? '?'}% · mem ${Math.round(total.mem ?? 0)}%`};
  } catch (err) {
    return {ok: false, message: describeError(err)};
  }
}

async function pollAndUpsert(serverId: string): Promise<void> {
  const server = await prisma.server.findUniqueOrThrow({
    where: {id: serverId},
    select: {baseUrl: true, apiSkEnc: true, insecureTLS: true},
  });
  try {
    const total = await createClientForServer(server).getSystemTotal();
    await prisma.serverStatus.upsert({
      where: {serverId},
      create: {serverId, online: true, cpu: total.cpu, mem: total.mem, error: null, lastCheckedAt: new Date()},
      update: {online: true, cpu: total.cpu, mem: total.mem, error: null, lastCheckedAt: new Date()},
    });
  } catch (err) {
    const message = describeError(err);
    await prisma.serverStatus.upsert({
      where: {serverId},
      create: {serverId, online: false, error: message, lastCheckedAt: new Date()},
      update: {online: false, error: message, lastCheckedAt: new Date()},
    });
    throw err;
  }
}

/** Live-polls one server and writes its status to the cache. */
export async function refreshServerStatusAction(serverId: string): Promise<SimpleResult> {
  let user;
  try {user = await requireUser();} catch {return {ok: false, message: 'unauthenticated'};}
  try {
    await pollAndUpsert(serverId);
    await recordAudit({userId: user.id, serverId, action: 'server.refresh', result: 'ok'});
    revalidatePath('/servers');
    return {ok: true, message: 'refreshed'};
  } catch (err) {
    await recordAudit({userId: user.id, serverId, action: 'server.refresh', result: 'error'});
    revalidatePath('/servers');
    return {ok: false, message: describeError(err)};
  }
}

/** Live-polls the visible page of servers (bounded concurrency) — the "live visible page" hybrid. */
export async function refreshVisibleStatusesAction(serverIds: string[]): Promise<{ok: boolean; refreshed: number; failed: number}> {
  try {await requireUser();} catch {return {ok: false, refreshed: 0, failed: serverIds.length};}
  const ids = serverIds.slice(0, 100);
  const results = await mapLimit(ids, 8, (id) => pollAndUpsert(id));
  const refreshed = results.filter((r) => r.ok).length;
  revalidatePath('/servers');
  return {ok: true, refreshed, failed: results.length - refreshed};
}
```

> Implementer: zod `flatten().fieldErrors` keys match form field names (`name`, `baseUrl`, `apiSk`, `tag`). Keep them aligned with the dialog inputs (Task 11).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test src/server/actions/servers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/server/actions/servers.ts web/src/server/actions/servers.test.ts
git commit -m "feat(servers): server actions (CRUD, test-connection, live refresh) with audit"
```

---

## Task 9: shadcn UI primitives + TanStack Table dependency

**Files:**
- Modify: `web/package.json` (+ lockfile)
- Create (generated): `web/src/components/ui/{table,dialog,dropdown-menu,select,badge,checkbox,switch}.tsx`

- [ ] **Step 1: Add the TanStack Table dependency (pin v8, NOT v9 alpha)**

Run (from `web/`):
```bash
pnpm add @tanstack/react-table@^8
```
Verify in `web/package.json` that the resolved version is `8.x`. If pnpm resolves a non-8 major, pin explicitly to the latest 8 release.

- [ ] **Step 2: Add shadcn components (base-nova style)**

Prefer the shadcn MCP (`get_add_command_for_items`) to get the exact command for this project, then run it. Fallback CLI:
```bash
pnpm dlx shadcn@latest add table dialog dropdown-menu select badge checkbox switch
```
Expected: components created under `src/components/ui/`. Do not hand-edit generated files beyond what later tasks require.

- [ ] **Step 3: Verify build still compiles**

Run: `pnpm build`
Expected: build succeeds (no type errors from new components).

- [ ] **Step 4: Commit**

```bash
git add web/package.json web/pnpm-lock.yaml web/src/components/ui
git commit -m "chore(servers): add @tanstack/react-table v8 and shadcn table/dialog/menu primitives"
```

---

## Task 10: Status badge + table columns + servers table (client)

**Files:**
- Create: `web/src/components/servers/status-badge.tsx`, `columns.tsx`, `servers-table.tsx`
- Test: `web/src/components/servers/status-badge.test.tsx` (Vitest + Testing Library if configured; otherwise a pure render-logic unit test)

> If React component testing isn't wired in Vitest yet, test the pure helper `statusVariant(online)` instead of rendering. Keep at least one unit test for the status mapping.

- [ ] **Step 1: Write the failing test (pure status mapping)**

```tsx
// web/src/components/servers/status-badge.test.tsx
import {describe, it, expect} from 'vitest';
import {statusVariant} from './status-badge';

describe('statusVariant', () => {
  it('maps online/offline/unknown', () => {
    expect(statusVariant(true)).toBe('online');
    expect(statusVariant(false)).toBe('offline');
    expect(statusVariant(null)).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/components/servers/status-badge.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `status-badge.tsx`**

```tsx
// web/src/components/servers/status-badge.tsx
'use client';
import {useTranslations} from 'next-intl';
import {Badge} from '@/components/ui/badge';
import {cn} from '@/lib/utils';

export type StatusKind = 'online' | 'offline' | 'unknown';

export function statusVariant(online: boolean | null): StatusKind {
  if (online === true) return 'online';
  if (online === false) return 'offline';
  return 'unknown';
}

const STYLES: Record<StatusKind, string> = {
  online: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  offline: 'bg-red-500/15 text-red-600 dark:text-red-400',
  unknown: 'bg-muted text-muted-foreground',
};

export function StatusBadge({online}: {online: boolean | null}) {
  const t = useTranslations('servers');
  const kind = statusVariant(online);
  return <Badge className={cn('font-medium', STYLES[kind])}>{t(kind)}</Badge>;
}
```

- [ ] **Step 4: Run the status test — expect PASS**

Run: `pnpm test src/components/servers/status-badge.test.tsx`
Expected: PASS.

- [ ] **Step 5: Implement `columns.tsx`**

```tsx
// web/src/components/servers/columns.tsx
'use client';
import type {ColumnDef} from '@tanstack/react-table';
import type {ServerRow} from '@/lib/servers/query';
import {StatusBadge} from './status-badge';

/** `t` is passed in from the table so headers are translated without a hook here. */
export function buildColumns(t: (key: string) => string): ColumnDef<ServerRow>[] {
  return [
    {accessorKey: 'name', header: t('name'), enableSorting: true, size: 200},
    {accessorKey: 'tag', header: t('tag'), enableSorting: true, size: 120,
      cell: ({row}) => row.original.tag ?? '—'},
    {id: 'status', header: t('status'), enableSorting: false, size: 110,
      cell: ({row}) => <StatusBadge online={row.original.online} />},
    {accessorKey: 'cpu', header: t('cpu'), enableSorting: true, size: 90,
      cell: ({row}) => (row.original.cpu == null ? '—' : `${row.original.cpu.toFixed(1)}%`)},
    {accessorKey: 'mem', header: t('mem'), enableSorting: true, size: 90,
      cell: ({row}) => (row.original.mem == null ? '—' : `${Math.round(row.original.mem)}%`)},
    {accessorKey: 'baseUrl', header: t('baseUrl'), enableSorting: false, size: 220},
    {id: 'lastCheckedAt', accessorKey: 'lastCheckedAt', header: t('lastChecked'), enableSorting: true, size: 160,
      cell: ({row}) => (row.original.lastCheckedAt ? new Date(row.original.lastCheckedAt).toLocaleString() : t('never'))},
  ];
}
```

> The `actions` column (refresh/edit/delete) is appended inside `servers-table.tsx` so it can receive callbacks and `isAdmin`. Implementer adds an `id: 'actions'` column there with a `DropdownMenu` (refresh for all; edit/delete admin-only) wired to `refreshServerStatusAction`, the edit dialog, and `delete-server-dialog`.

- [ ] **Step 6: Implement `servers-table.tsx` (v8, manual sorting/pagination via URL)**

Requirements (complete logic, implementer assembles JSX with shadcn `Table`):
- `'use client'`. Props: `{data: ServerRow[]; total: number; params: ServerListParams; isAdmin: boolean}`.
- `useReactTable({data, columns, getCoreRowModel: getCoreRowModel(), manualSorting: true, manualPagination: true, rowCount: total, columnResizeMode: 'onChange', state: {sorting, pagination, columnVisibility, columnSizing}, onSortingChange, onPaginationChange, onColumnVisibilityChange, onColumnSizingChange})`.
- Derive initial `sorting` from `params.sort/params.dir`; initial `pagination` from `params.page-1/params.pageSize`.
- On `sorting`/`pagination` change, build a new `URLSearchParams` (preserving `q/status/tag`) and call `router.push(\`/servers?${qs}\`)` (from `next/navigation`) inside a `useTransition` so the RSC refetches. Use a `useRef` guard to avoid pushing on the first render.
- Persist `columnVisibility` and `columnSizing` to `localStorage` (`servers:cols`, `servers:sizes`); hydrate from it in a `useEffect` (avoid SSR hydration mismatch — read in effect, not during render).
- Render rows inside `framer-motion`'s `<AnimatePresence>`; each `<motion.tr>` keyed by `row.original.id` with subtle fade/slide (`initial/animate/exit`, ~150ms). Respect `prefers-reduced-motion` (Framer's `useReducedMotion`).
- Append the `actions` column (see Step 5 note).
- Sortable headers: clickable, show ▲/▼ from `header.column.getIsSorted()`; resize handle uses `header.getResizeHandler()`.
- Pagination footer: prev/next buttons (disabled at bounds), "page X of N", page-size `Select`. Wire to table pagination API.

> Keep the data source the RSC props (URL-driven). TanStack here is presentation + column UX only; it does NOT fetch. (TanStack Query — client cache for SSE — is deferred to Phase 3.)

- [ ] **Step 7: Build to typecheck the client component**

Run: `pnpm build`
Expected: success.

- [ ] **Step 8: Commit**

```bash
git add web/src/components/servers/status-badge.tsx web/src/components/servers/status-badge.test.tsx web/src/components/servers/columns.tsx web/src/components/servers/servers-table.tsx
git commit -m "feat(servers): dense servers table (TanStack v8, URL-synced sort/paginate, animations)"
```

---

## Task 11: Form dialog + delete dialog (Server Actions + useActionState)

**Files:**
- Create: `web/src/components/servers/server-form-dialog.tsx`, `web/src/components/servers/delete-server-dialog.tsx`

> Mirror the existing Server-Action form pattern (`src/app/(auth)/login/page.tsx`) but use `useActionState` for inline field errors. No react-hook-form.

- [ ] **Step 1: Implement `server-form-dialog.tsx`**

Requirements:
- `'use client'`. Props: `{mode: 'create' | 'edit'; server?: ServerRow; trigger: React.ReactNode}`.
- `const [state, formAction, pending] = useActionState(mode === 'create' ? createServerAction : updateServerAction, {ok: false, error: ''})`.
- shadcn `Dialog` with `<form action={formAction}>`. Fields: `name`, `baseUrl`, `apiSk` (password input; in edit mode placeholder "leave blank to keep"), `tag`, `insecureTLS` (`Switch`, default on). In edit mode include a hidden `<input name="id" value={server.id}>`.
- Show `state.fieldErrors?.<field>` under each input; show `state.error` at the top when `!state.ok && error !== 'validation'`.
- **Test connection** button (type="button"): collects current form values into `FormData`, calls `testConnectionAction` inside `useTransition`, shows the result via `sonner` `toast.success`/`toast.error`. Include hidden `id` when editing (so blank api_sk uses the stored key).
- On `state.ok` (success), close the dialog and `toast.success(t(state.message ?? 'saved'))`. Use a controlled `open` state + `useEffect` on `state`.
- Submit button disabled while `pending`; label from i18n.

- [ ] **Step 2: Implement `delete-server-dialog.tsx`**

Requirements:
- `'use client'`. Props: `{server: Pick<ServerRow,'id'|'name'>; trigger: React.ReactNode}`.
- shadcn `Dialog` confirm: shows `t('confirmDelete', {name})`. Confirm button runs `deleteServerAction` (build `FormData` with `id`) in `useTransition`; on `ok` → `toast.success(t('deleted'))` and close; on failure → `toast.error`.
- Destructive styling on the confirm button.

- [ ] **Step 3: Build to typecheck**

Run: `pnpm build`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/servers/server-form-dialog.tsx web/src/components/servers/delete-server-dialog.tsx
git commit -m "feat(servers): add/edit/delete dialogs with inline validation and test-connection"
```

---

## Task 12: Toolbar + servers page (RSC) + i18n + nav + index redirect

**Files:**
- Create: `web/src/components/servers/servers-toolbar.tsx`, `web/src/app/(app)/servers/page.tsx`, `loading.tsx`, `error.tsx`
- Modify: `web/src/app/(app)/page.tsx`, `web/src/components/app-shell.tsx`, `web/messages/ru.json`, `web/messages/en.json`

- [ ] **Step 1: Add i18n strings**

Extend the `servers` namespace in BOTH `web/messages/ru.json` and `web/messages/en.json`. Required keys (RU shown; mirror in EN):

```
servers: title, add, edit, delete, save, cancel, test, testing,
  name, baseUrl, apiSk, apiSkKeep, tag, insecureTLS,
  status, online, offline, unknown, cpu, mem, lastChecked, never, actions,
  refresh, refreshVisible, refreshed, refreshFailed,
  search, filterStatus, filterTag, columns,
  created, updated, deleted, saved, confirmDelete, noServers,
  page, of, perPage, prev, next
```

Example (RU values — translate sensibly): `"add": "Добавить сервер"`, `"confirmDelete": "Удалить сервер «{name}»? Действие необратимо."`, `"noServers": "Серверов пока нет"`, etc. Keep the existing `nav.servers` value.

- [ ] **Step 2: Implement `servers-toolbar.tsx`**

Requirements:
- `'use client'`. Props: `{params: ServerListParams; isAdmin: boolean; visibleIds: string[]}`.
- Search `Input` (debounced ~300ms) → updates `q` in the URL (reset `page` to 1) via `router.push` in `useTransition`.
- Status `Select` (`all/online/offline/unknown`) and an optional tag filter input → update URL.
- Column-visibility dropdown is owned by the table; the toolbar exposes **Refresh visible** button → `refreshVisibleStatusesAction(visibleIds)` in `useTransition`, toast with counts, then `router.refresh()`.
- **Add server** button (admin only) → renders `<ServerFormDialog mode="create" trigger={…} />`.

- [ ] **Step 3: Implement the page (RSC)**

```tsx
// web/src/app/(app)/servers/page.tsx
import {getTranslations} from 'next-intl/server';
import {requireUser} from '@/lib/auth/guards';
import {serverListParamsSchema} from '@/lib/validation/server';
import {listServers} from '@/lib/servers/query';
import {ServersTable} from '@/components/servers/servers-table';
import {ServersToolbar} from '@/components/servers/servers-toolbar';

export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const params = serverListParamsSchema.parse(sp);
  const {rows, total} = await listServers(params);
  const t = await getTranslations('servers');
  const isAdmin = user.role === 'admin';

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
      </div>
      <ServersToolbar params={params} isAdmin={isAdmin} visibleIds={rows.map((r) => r.id)} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground">{t('noServers')}</p>
      ) : (
        <ServersTable data={rows} total={total} params={params} isAdmin={isAdmin} />
      )}
    </section>
  );
}
```

- [ ] **Step 4: Implement `loading.tsx` and `error.tsx`**

```tsx
// web/src/app/(app)/servers/loading.tsx
export default function Loading() {
  return <div className="h-64 animate-pulse rounded-xl border bg-muted/30" aria-busy="true" />;
}
```

```tsx
// web/src/app/(app)/servers/error.tsx
'use client';
import {useEffect} from 'react';
import {Button} from '@/components/ui/button';

export default function Error({error, reset}: {error: Error & {digest?: string}; reset: () => void}) {
  useEffect(() => {console.error(error);}, [error]);
  return (
    <div className="space-y-3 rounded-xl border p-6">
      <p className="text-sm text-destructive">Failed to load servers.</p>
      <Button onClick={reset} size="sm">Retry</Button>
    </div>
  );
}
```

- [ ] **Step 5: Redirect index + fix nav link**

```tsx
// web/src/app/(app)/page.tsx
import {redirect} from 'next/navigation';
export default function Home() {redirect('/servers');}
```

In `web/src/components/app-shell.tsx`, change the brand and nav links from `href="/"` to `href="/servers"` (keep the `t('servers')` label). The login/signOut `redirectTo` may stay `/` (it redirects onward to `/servers`).

- [ ] **Step 6: Build + typecheck**

Run: `pnpm build && pnpm typecheck`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add web/src/components/servers/servers-toolbar.tsx web/src/app/(app)/servers web/src/app/(app)/page.tsx web/src/components/app-shell.tsx web/messages/ru.json web/messages/en.json
git commit -m "feat(servers): /servers page, toolbar, i18n, nav and index redirect"
```

---

## Task 13: E2E (Playwright) — add → view → refresh → delete

**Files:**
- Create: `web/e2e/servers.spec.ts`

> Reuse the Phase 1 login helper/flow (`web/e2e/auth.spec.ts`). Use a placeholder panel URL so the test never depends on a live aaPanel — `testConnection`/`refresh` will report offline, which exercises the offline path. Use a unique server name per run.

- [ ] **Step 1: Write the e2e test**

```ts
// web/e2e/servers.spec.ts
import {test, expect} from '@playwright/test';

const ADMIN = {email: 'admin@example.com', password: 'changeme123'};

async function login(page) {
  await page.goto('/login');
  await page.getByLabel(/почта|email/i).fill(ADMIN.email);
  await page.getByLabel(/пароль|password/i).fill(ADMIN.password);
  await page.getByRole('button', {name: /войти|sign in/i}).click();
  await expect(page).toHaveURL(/\/servers/);
}

test('admin can add a server, see it, and delete it', async ({page}) => {
  const name = `e2e-${Date.now()}`;
  await login(page);

  await page.getByRole('button', {name: /добавить|add/i}).click();
  await page.getByLabel(/название|name/i).fill(name);
  await page.getByLabel(/url/i).fill('https://10.255.255.1:8888');
  await page.getByLabel(/api[_ ]?sk/i).fill('e2e_dummy_api_sk_value');
  await page.getByRole('button', {name: /сохранить|save/i}).click();

  await expect(page.getByText(name)).toBeVisible();

  // delete
  await page.getByRole('row', {name: new RegExp(name)}).getByRole('button').last().click();
  await page.getByRole('menuitem', {name: /удалить|delete/i}).click();
  await page.getByRole('button', {name: /удалить|delete|подтверд/i}).click();
  await expect(page.getByText(name)).toHaveCount(0);
});
```

- [ ] **Step 2: Run e2e**

Run: `pnpm test:e2e e2e/servers.spec.ts`
Expected: PASS. (If selectors differ from the implemented labels/roles, adjust the test to match the real DOM — do not loosen assertions to pass falsely.)

- [ ] **Step 3: Clean up the test row**

The test deletes its own server. Verify no `e2e-*` rows remain (the delete step asserts this). If a run aborts mid-test, leftover rows are harmless (placeholder URLs) but may be removed manually.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/servers.spec.ts
git commit -m "test(servers): e2e add/view/delete flow"
```

---

## Task 14: Full verification + docs/spec reconciliation

**Files:**
- Modify: `docs/superpowers/specs/2026-06-08-aapanel-manager-app-design.md`, `docs/project-index.md`, `docs/NAVIGATION.md`

- [ ] **Step 1: Run the whole suite**

Run (from `web/`): `pnpm test && pnpm build && pnpm typecheck && pnpm lint`
Expected: all green. Fix anything that fails before continuing.

- [ ] **Step 2: Manual smoke (optional but recommended)**

`pnpm dev` → login as admin → add a server (real test panel if available to see live metrics; otherwise placeholder) → Refresh visible → confirm status updates → edit → delete. As a `viewer` user (create one via seed/DB), confirm add/edit/delete controls are hidden and the actions are server-side forbidden.

- [ ] **Step 3: Reconcile the spec stack note**

In the design spec §5, add a short note: Phase 1/2 use **base-nova / Base UI** shadcn (not Radix) and **Server Actions + `useActionState` + zod** for forms (react-hook-form dropped); **TanStack Table v8** adopted in Phase 2; **TanStack Query deferred to Phase 3** (SSE). Update §15.2 to mark Phase 2 done.

- [ ] **Step 4: Update `docs/project-index.md` and `docs/NAVIGATION.md`**

Add the `web/` app structure entries created in Phase 2 (aapanel client, actions, servers query, servers UI). Keep it proportional (a `web/` section; not every file). NAVIGATION: add an "Приложение (web/)" group linking the servers route + key modules.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-06-08-aapanel-manager-app-design.md docs/project-index.md docs/NAVIGATION.md
git commit -m "docs(servers): reconcile spec stack and update index/navigation for Phase 2"
```

- [ ] **Step 6: Final review + finish branch**

Dispatch a final code-review subagent over the whole Phase 2 diff (`git diff main...feat/phase-2-servers`). Then use **superpowers:finishing-a-development-branch** to merge/PR per the user's choice.

---

## Self-Review (plan vs. spec)

**Spec coverage (§15.2 Phase 2 = "CRUD server + cached table + manual refresh"):**
- CRUD server (admin, encrypted creds) → Tasks 5, 8, 11. ✅
- Servers table from cache → Tasks 7, 10, 12. ✅
- Manual refresh (single + visible page = hybrid) → Task 8 (`refreshServerStatusAction`, `refreshVisibleStatusesAction`), Task 12 toolbar. ✅
- Roles (viewer read-only) → guards in every mutating action (Task 8) + UI gating (Tasks 10–12). ✅
- Encryption at rest → Task 8 uses `encryptSecret`/`getEncryptionKey`; never selected back to client (Task 7). ✅
- Audit → Task 6 + wired in Task 8. ✅
- i18n RU/EN → Task 12. ✅
- Error handling/logging → normalized `AaPanelError`, pino, `error.tsx`. ✅
- Scale (server-side pagination, no secret in payload, bounded concurrency) → Tasks 7, 8, 10. ✅

**Type consistency:** `ServerRow` (Task 7) is the single row type consumed by `columns.tsx`/`servers-table.tsx`/dialogs. `ActionState` (Task 8) is consumed by `useActionState` in Task 11. `ServerListParams` (Task 5) flows page→toolbar→table. `SystemTotal` (Task 2) returned by client, consumed by actions. Names checked consistent.

**Placeholder scan:** No TBD/TODO. UI component tasks (10–12) give complete logic/requirements + key code; pure presentational JSX assembly is left to the implementer against shadcn primitives (explicitly noted), which is appropriate granularity.

**Known deviations from spec §5 (intentional, approved):** drop react-hook-form; base-nova not Radix; defer TanStack Query to Phase 3; column drag-reorder deferred to a later polish pass (sort/resize/hide included now). Reconciled in Task 14.

---

## Execution Handoff

Plan saved to `docs/superpowers/plans/2026-06-09-phase-2-servers.md`. Recommended execution: **subagent-driven-development** (fresh subagent per task, two-stage review between tasks), on branch `feat/phase-2-servers`.
