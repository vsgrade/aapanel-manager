# Phase 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `web/` Next.js application skeleton with authentication (multi-user + roles), encrypted-secret storage primitives, PostgreSQL/Prisma, i18n (RU/EN), an app shell, and dual deploy (bare-metal + Docker) — a working, authenticated, tested foundation to build features on.

**Architecture:** Next.js 16 App Router (RSC + Server Actions) as a backend-proxy app. PostgreSQL via Prisma for users/roles/servers/status/audit. Auth.js v5 (Credentials + JWT strategy, Prisma adapter for the user store, role in JWT/session callbacks). Secrets (`api_sk`) encrypted at rest with AES-256-GCM. next-intl in cookie mode (no URL routing). UI via Tailwind v4 + shadcn/ui.

**Tech Stack:** Next.js 16, React 19, TypeScript (strict), Node 24 LTS, pnpm, PostgreSQL + Prisma, Auth.js v5 (`next-auth@beta`), zod, argon2 (password hashing), Tailwind v4 + shadcn/ui, next-intl, Vitest, Playwright, pino, Docker.

> This is **Phase 1 of 5** (see spec `docs/superpowers/specs/2026-06-08-aapanel-manager-app-design.md` §15). Later phases (Servers CRUD, Worker+SSE, Overview+Projects, iterative sections) get their own plans.

> **Convention for commands:** run all `pnpm`/`npx` commands from `web/` unless stated. Commit after each task. Pin exact dependency versions produced by the scaffold (don't hand-edit to ranges).

---

## File Structure (created across Phase 1)

```
web/
  package.json, pnpm-lock.yaml, tsconfig.json, next.config.ts, .env.example, .env (gitignored)
  Dockerfile, docker-compose.yml, .dockerignore
  vitest.config.ts, playwright.config.ts
  prisma/schema.prisma, prisma/seed.ts
  src/
    env.ts                      # zod-validated env
    auth.ts                     # Auth.js v5 config (handlers, auth, signIn, signOut)
    proxy.ts                    # route protection + next-intl middleware
    i18n/request.ts             # next-intl getRequestConfig (cookie locale)
    i18n/locale.ts              # get/set locale cookie helpers
    lib/
      crypto/secret-box.ts      # AES-256-GCM encrypt/decrypt
      crypto/password.ts        # argon2 hash/verify
      db/prisma.ts              # Prisma client singleton
      auth/guards.ts            # requireUser / requireAdmin
      validation/auth.ts        # zod sign-in schema
      log.ts                    # pino logger
    components/
      app-shell.tsx             # top bar + nav + breadcrumb (client where needed)
      ui/                       # shadcn components (button, input, ...)
    app/
      layout.tsx                # root layout (NextIntlClientProvider, theme, fonts)
      globals.css
      (auth)/login/page.tsx     # login form (Server Action sign-in)
      (app)/layout.tsx          # authed layout w/ AppShell
      (app)/page.tsx            # placeholder dashboard ("Servers" lands here in Phase 2)
      api/auth/[...nextauth]/route.ts
    messages/en.json, messages/ru.json
    test/                       # Vitest unit tests
  e2e/                          # Playwright tests
```

---

## Task 1: Scaffold the `web/` Next.js app

**Files:**
- Create: `web/` (via create-next-app)

- [ ] **Step 1: Verify Node version**

Run (repo root): `node -v`
Expected: `v24.x` (Next.js 16 requires ≥ 20.9; we target 24 LTS). If not 24.x, install Node 24 LTS first.

- [ ] **Step 2: Scaffold the app**

Run (repo root):
```bash
pnpm create next-app@latest web --ts --app --eslint --src-dir --tailwind --import-alias "@/*" --use-pnpm --no-turbopack
```
Answer any interactive prompts to match: TypeScript yes, App Router yes, `src/` yes, Tailwind yes, import alias `@/*`.

- [ ] **Step 3: Verify it runs**

Run (from `web/`): `pnpm dev`
Open `http://localhost:3000` → Next.js welcome page renders. Stop with Ctrl+C.

- [ ] **Step 4: Enable strict TS + standalone output**

Edit `web/tsconfig.json` → ensure `"strict": true` (scaffold sets it).
Edit `web/next.config.ts`:
```ts
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {typedRoutes: true},
};

export default nextConfig;
```

- [ ] **Step 5: Commit**

```bash
git add web/ && git commit -m "feat(web): scaffold Next.js 16 app (App Router, TS strict, Tailwind, pnpm)"
```

---

## Task 2: shadcn/ui + base UI deps

**Files:**
- Create: `web/components.json`, `web/src/components/ui/*`, `web/src/lib/utils.ts`

- [ ] **Step 1: Init shadcn/ui**

Run (from `web/`): `pnpm dlx shadcn@latest init -d`
(`-d` = defaults; it detects Tailwind v4 and writes `components.json` + `src/lib/utils.ts`.)

- [ ] **Step 2: Add the base components we need now**

Run: `pnpm dlx shadcn@latest add button input label card sonner dropdown-menu avatar table badge dialog form`

- [ ] **Step 3: Add motion + icons**

Run: `pnpm add framer-motion lucide-react`

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: build succeeds (no type errors).

- [ ] **Step 5: Commit**

```bash
git add web/ && git commit -m "feat(web): add shadcn/ui base components, framer-motion, lucide"
```

---

## Task 3: Testing harness (Vitest)

**Files:**
- Create: `web/vitest.config.ts`, `web/src/test/setup.ts`
- Modify: `web/package.json` (scripts)

- [ ] **Step 1: Install Vitest**

Run: `pnpm add -D vitest @vitest/coverage-v8 tsx`

- [ ] **Step 2: Create `web/vitest.config.ts`**

```ts
import {defineConfig} from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {environment: 'node', include: ['src/**/*.test.ts'], globals: true},
});
```

- [ ] **Step 3: Install the paths plugin**

Run: `pnpm add -D vite-tsconfig-paths`

- [ ] **Step 4: Add scripts to `web/package.json`**

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 5: Smoke test**

Create `web/src/test/sanity.test.ts`:
```ts
import {expect, test} from 'vitest';
test('sanity', () => { expect(1 + 1).toBe(2); });
```
Run: `pnpm test` → Expected: 1 passed.

- [ ] **Step 6: Commit**

```bash
git add web/ && git commit -m "test(web): add Vitest harness"
```

---

## Task 4: Environment config (zod-validated)

**Files:**
- Create: `web/src/env.ts`, `web/src/env.test.ts`, `web/.env.example`

- [ ] **Step 1: Install zod**

Run: `pnpm add zod`

- [ ] **Step 2: Write the failing test** — `web/src/env.test.ts`

```ts
import {describe, expect, it} from 'vitest';
import {parseEnv} from './env';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  AUTH_SECRET: 'x'.repeat(32),
  APP_ENCRYPTION_KEY: 'a'.repeat(64), // 32 bytes hex
};

describe('parseEnv', () => {
  it('accepts valid env', () => {
    expect(() => parseEnv(valid)).not.toThrow();
  });
  it('rejects short encryption key', () => {
    expect(() => parseEnv({...valid, APP_ENCRYPTION_KEY: 'ab'})).toThrow();
  });
  it('rejects missing DATABASE_URL', () => {
    const {DATABASE_URL, ...rest} = valid;
    expect(() => parseEnv(rest)).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test src/env.test.ts` → Expected: FAIL (`parseEnv` not exported).

- [ ] **Step 4: Implement** — `web/src/env.ts`

```ts
import {z} from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  // 32 bytes encoded as 64 hex chars
  APP_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex chars (32 bytes)'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: Record<string, unknown> = process.env): Env {
  return EnvSchema.parse(source);
}

export const env: Env = parseEnv();
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test src/env.test.ts` → Expected: 3 passed.

- [ ] **Step 6: Create `web/.env.example`**

```dotenv
# PostgreSQL
DATABASE_URL="postgresql://aapanel:CHANGE_ME@localhost:5432/aapanel_manager?schema=public"
# Auth.js session secret (>=32 chars). Generate: openssl rand -base64 32
AUTH_SECRET="CHANGE_ME_32_CHARS_MINIMUM________"
# AES-256-GCM master key, 32 bytes hex (64 chars). Generate: openssl rand -hex 32
APP_ENCRYPTION_KEY="0000000000000000000000000000000000000000000000000000000000000000"
# Background poll interval (ms)
POLL_INTERVAL_MS=60000
```

- [ ] **Step 7: Commit**

```bash
git add web/ && git commit -m "feat(web): zod-validated env config + .env.example"
```

---

## Task 5: Secret encryption (AES-256-GCM)

**Files:**
- Create: `web/src/lib/crypto/secret-box.ts`, `web/src/lib/crypto/secret-box.test.ts`

- [ ] **Step 1: Write the failing test** — `secret-box.test.ts`

```ts
import {describe, expect, it} from 'vitest';
import {encryptSecret, decryptSecret} from './secret-box';

const key = 'a'.repeat(64); // 32 bytes hex

describe('secret-box', () => {
  it('round-trips a secret', () => {
    const enc = encryptSecret('my-api_sk', key);
    expect(enc).not.toContain('my-api_sk');
    expect(decryptSecret(enc, key)).toBe('my-api_sk');
  });
  it('produces different ciphertext each time (random IV)', () => {
    expect(encryptSecret('x', key)).not.toBe(encryptSecret('x', key));
  });
  it('fails to decrypt if tampered', () => {
    const enc = encryptSecret('x', key);
    const bad = enc.slice(0, -2) + (enc.endsWith('aa') ? 'bb' : 'aa');
    expect(() => decryptSecret(bad, key)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test secret-box` → Expected: FAIL (module missing).

- [ ] **Step 3: Implement** — `secret-box.ts`

```ts
import {randomBytes, createCipheriv, createDecipheriv} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

function keyToBuffer(hexKey: string): Buffer {
  const buf = Buffer.from(hexKey, 'hex');
  if (buf.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 32 bytes (64 hex chars)');
  return buf;
}

/** Returns base64 of iv(12) || tag(16) || ciphertext. */
export function encryptSecret(plain: string, hexKey: string): string {
  const key = keyToBuffer(hexKey);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(payloadB64: string, hexKey: string): string {
  const key = keyToBuffer(hexKey);
  const data = Buffer.from(payloadB64, 'base64');
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(IV_LEN, IV_LEN + 16);
  const ct = data.subarray(IV_LEN + 16);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test secret-box` → Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add web/ && git commit -m "feat(web): AES-256-GCM secret encryption helpers"
```

---

## Task 6: Password hashing (argon2)

**Files:**
- Create: `web/src/lib/crypto/password.ts`, `web/src/lib/crypto/password.test.ts`

- [ ] **Step 1: Install argon2**

Run: `pnpm add argon2`

- [ ] **Step 2: Write the failing test** — `password.test.ts`

```ts
import {describe, expect, it} from 'vitest';
import {hashPassword, verifyPassword} from './password';

describe('password', () => {
  it('verifies a correct password', async () => {
    const h = await hashPassword('s3cret!');
    expect(await verifyPassword(h, 's3cret!')).toBe(true);
  });
  it('rejects a wrong password', async () => {
    const h = await hashPassword('s3cret!');
    expect(await verifyPassword(h, 'nope')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test password` → Expected: FAIL.

- [ ] **Step 4: Implement** — `password.ts`

```ts
import argon2 from 'argon2';

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, {type: argon2.argon2id});
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test password` → Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add web/ && git commit -m "feat(web): argon2 password hashing helpers"
```

---

## Task 7: PostgreSQL + Prisma schema & client

**Files:**
- Create: `web/prisma/schema.prisma`, `web/src/lib/db/prisma.ts`
- Requires: a running Postgres (local or `docker compose up postgres` from Task 12; for now a local DB or Docker one-off).

- [ ] **Step 1: Install Prisma**

Run: `pnpm add @prisma/client && pnpm add -D prisma`

- [ ] **Step 2: Start a Postgres for dev** (one-off Docker; Task 12 formalizes compose)

Run (repo root):
```bash
docker run -d --name aapanel-pg -e POSTGRES_USER=aapanel -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=aapanel_manager -p 5432:5432 postgres:17
```
Set `web/.env` `DATABASE_URL="postgresql://aapanel:devpass@localhost:5432/aapanel_manager?schema=public"` (copy from `.env.example`, fill secrets via the generate commands).

- [ ] **Step 3: Write `web/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  admin
  viewer
}

model User {
  id           String     @id @default(cuid())
  email        String     @unique
  passwordHash String
  role         Role       @default(viewer)
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt
  auditLogs    AuditLog[]
}

model Server {
  id          String        @id @default(cuid())
  name        String
  tag         String?
  baseUrl     String
  apiSkEnc    String        // AES-256-GCM encrypted api_sk
  insecureTLS Boolean       @default(true)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt
  status      ServerStatus?
  auditLogs   AuditLog[]
}

model ServerStatus {
  serverId      String   @id
  server        Server   @relation(fields: [serverId], references: [id], onDelete: Cascade)
  online        Boolean  @default(false)
  cpu           Float?
  mem           Float?
  disk          Float?
  projectCount  Int?
  error         String?
  lastCheckedAt DateTime @default(now())
}

model AuditLog {
  id        String   @id @default(cuid())
  userId    String?
  user      User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  serverId  String?
  server    Server?  @relation(fields: [serverId], references: [id], onDelete: SetNull)
  action    String
  target    String?
  result    String
  createdAt DateTime @default(now())

  @@index([serverId])
  @@index([userId])
}
```

- [ ] **Step 4: Create the migration**

Run (from `web/`): `pnpm prisma migrate dev --name init`
Expected: migration applied, `@prisma/client` generated.

- [ ] **Step 5: Create the client singleton** — `web/src/lib/db/prisma.ts`

```ts
import {PrismaClient} from '@prisma/client';

const globalForPrisma = globalThis as unknown as {prisma?: PrismaClient};

export const prisma =
  globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 6: Verify**

Run: `pnpm prisma studio` (opens DB browser; confirm tables exist) then close. Or `pnpm typecheck`.

- [ ] **Step 7: Commit**

```bash
git add web/ && git commit -m "feat(web): Prisma schema (User/Server/ServerStatus/AuditLog) + client"
```

---

## Task 8: Auth.js v5 (Credentials + roles)

**Files:**
- Create: `web/src/lib/validation/auth.ts` (+ test), `web/src/auth.ts`, `web/src/app/api/auth/[...nextauth]/route.ts`, `web/types/next-auth.d.ts`

- [ ] **Step 1: Install Auth.js + adapter**

Run: `pnpm add next-auth@beta @auth/prisma-adapter`

- [ ] **Step 2: Write the failing test for the sign-in schema** — `web/src/lib/validation/auth.test.ts`

```ts
import {describe, expect, it} from 'vitest';
import {signInSchema} from './auth';

describe('signInSchema', () => {
  it('accepts a valid credential pair', () => {
    expect(() => signInSchema.parse({email: 'a@b.com', password: 'longenough'})).not.toThrow();
  });
  it('rejects a bad email', () => {
    expect(() => signInSchema.parse({email: 'nope', password: 'longenough'})).toThrow();
  });
  it('rejects a short password', () => {
    expect(() => signInSchema.parse({email: 'a@b.com', password: 'x'})).toThrow();
  });
});
```

- [ ] **Step 3: Run to verify fail** — `pnpm test validation/auth` → FAIL.

- [ ] **Step 4: Implement schema** — `web/src/lib/validation/auth.ts`

```ts
import {z} from 'zod';

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type SignInInput = z.infer<typeof signInSchema>;
```

- [ ] **Step 5: Run to verify pass** — `pnpm test validation/auth` → 3 passed.

- [ ] **Step 6: Type augmentation** — `web/types/next-auth.d.ts`

```ts
import type {Role} from '@prisma/client';
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface User {role: Role;}
  interface Session {user: {id: string; email: string; role: Role};}
}
declare module 'next-auth/jwt' {
  interface JWT {id: string; role: Role;}
}
```

- [ ] **Step 7: Auth config** — `web/src/auth.ts`

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import {PrismaAdapter} from '@auth/prisma-adapter';
import {prisma} from '@/lib/db/prisma';
import {verifyPassword} from '@/lib/crypto/password';
import {signInSchema} from '@/lib/validation/auth';

export const {handlers, auth, signIn, signOut} = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: {strategy: 'jwt'}, // required for Credentials
  pages: {signIn: '/login'},
  providers: [
    Credentials({
      credentials: {email: {}, password: {}},
      authorize: async (raw) => {
        const parsed = signInSchema.safeParse(raw);
        if (!parsed.success) return null;
        const {email, password} = parsed.data;
        const user = await prisma.user.findUnique({where: {email}});
        if (!user) return null;
        const ok = await verifyPassword(user.passwordHash, password);
        if (!ok) return null;
        return {id: user.id, email: user.email, role: user.role};
      },
    }),
  ],
  callbacks: {
    jwt({token, user}) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
      }
      return token;
    },
    session({session, token}) {
      session.user.id = token.id;
      session.user.role = token.role;
      return session;
    },
  },
});
```

- [ ] **Step 8: Route handler** — `web/src/app/api/auth/[...nextauth]/route.ts`

```ts
import {handlers} from '@/auth';
export const {GET, POST} = handlers;
```

- [ ] **Step 9: Verify typecheck** — `pnpm typecheck` → no errors.

- [ ] **Step 10: Commit**

```bash
git add web/ && git commit -m "feat(web): Auth.js v5 credentials auth with role in JWT/session"
```

---

## Task 9: Role guards

**Files:**
- Create: `web/src/lib/auth/guards.ts`, `web/src/lib/auth/guards.test.ts`

- [ ] **Step 1: Write the failing test** — `guards.test.ts`

```ts
import {describe, expect, it, vi, beforeEach} from 'vitest';

const authMock = vi.fn();
vi.mock('@/auth', () => ({auth: () => authMock()}));

import {requireUser, requireAdmin, AuthError} from './guards';

beforeEach(() => authMock.mockReset());

describe('guards', () => {
  it('requireUser returns the session user when authed', async () => {
    authMock.mockResolvedValue({user: {id: 'u1', email: 'a@b.com', role: 'viewer'}});
    await expect(requireUser()).resolves.toEqual({id: 'u1', email: 'a@b.com', role: 'viewer'});
  });
  it('requireUser throws when unauthenticated', async () => {
    authMock.mockResolvedValue(null);
    await expect(requireUser()).rejects.toBeInstanceOf(AuthError);
  });
  it('requireAdmin throws for viewer', async () => {
    authMock.mockResolvedValue({user: {id: 'u1', email: 'a@b.com', role: 'viewer'}});
    await expect(requireAdmin()).rejects.toBeInstanceOf(AuthError);
  });
  it('requireAdmin passes for admin', async () => {
    authMock.mockResolvedValue({user: {id: 'u1', email: 'a@b.com', role: 'admin'}});
    await expect(requireAdmin()).resolves.toMatchObject({role: 'admin'});
  });
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm test guards` → FAIL.

- [ ] **Step 3: Implement** — `web/src/lib/auth/guards.ts`

```ts
import {auth} from '@/auth';
import type {Role} from '@prisma/client';

export class AuthError extends Error {
  constructor(public code: 'unauthenticated' | 'forbidden') {
    super(code);
    this.name = 'AuthError';
  }
}

export interface SessionUser {id: string; email: string; role: Role;}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new AuthError('unauthenticated');
  return session.user as SessionUser;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== 'admin') throw new AuthError('forbidden');
  return user;
}
```

- [ ] **Step 4: Run to verify pass** — `pnpm test guards` → 4 passed.

- [ ] **Step 5: Commit**

```bash
git add web/ && git commit -m "feat(web): role guards (requireUser/requireAdmin)"
```

---

## Task 10: i18n (next-intl, cookie mode)

**Files:**
- Create: `web/src/i18n/request.ts`, `web/src/i18n/locale.ts`, `web/messages/en.json`, `web/messages/ru.json`
- Modify: `web/next.config.ts`

- [ ] **Step 1: Install**

Run: `pnpm add next-intl`

- [ ] **Step 2: Messages** — `web/messages/en.json`

```json
{"app": {"title": "aaPanel Manager"}, "auth": {"signIn": "Sign in", "email": "Email", "password": "Password", "invalid": "Invalid email or password"}, "nav": {"servers": "Servers", "users": "Users", "signOut": "Sign out"}}
```

`web/messages/ru.json`
```json
{"app": {"title": "aaPanel Менеджер"}, "auth": {"signIn": "Войти", "email": "Эл. почта", "password": "Пароль", "invalid": "Неверная почта или пароль"}, "nav": {"servers": "Серверы", "users": "Пользователи", "signOut": "Выйти"}}
```

- [ ] **Step 3: Locale cookie helpers** — `web/src/i18n/locale.ts`

```ts
import {cookies} from 'next/headers';

export const LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'ru';
const COOKIE = 'NEXT_LOCALE';

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(COOKIE)?.value;
  return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
}

export async function setLocale(locale: Locale): Promise<void> {
  (await cookies()).set(COOKIE, locale, {path: '/', maxAge: 60 * 60 * 24 * 365});
}
```

- [ ] **Step 4: Request config** — `web/src/i18n/request.ts`

```ts
import {getRequestConfig} from 'next-intl/server';
import {getLocale} from './locale';

export default getRequestConfig(async () => {
  const locale = await getLocale();
  return {locale, messages: (await import(`../../messages/${locale}.json`)).default};
});
```

- [ ] **Step 5: Wire the plugin** — `web/next.config.ts`

```ts
import type {NextConfig} from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {typedRoutes: true},
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 6: Verify** — `pnpm typecheck` → ok.

- [ ] **Step 7: Commit**

```bash
git add web/ && git commit -m "feat(web): next-intl (cookie locale, RU default + EN)"
```

---

## Task 11: Root layout, login page, app shell, route protection

**Files:**
- Modify: `web/src/app/layout.tsx`, `web/src/app/globals.css`
- Create: `web/src/app/(auth)/login/page.tsx`, `web/src/app/(app)/layout.tsx`, `web/src/app/(app)/page.tsx`, `web/src/components/app-shell.tsx`, `web/src/proxy.ts`, `web/src/log.ts`

- [ ] **Step 1: Logger** — `web/src/log.ts`

```ts
import pino from 'pino';
export const log = pino({level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'});
```
Run: `pnpm add pino`

- [ ] **Step 2: Root layout** — `web/src/app/layout.tsx`

```tsx
import type {Metadata} from 'next';
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';
import {getLocale} from '@/i18n/locale';
import {Toaster} from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {title: 'aaPanel Manager'};

export default async function RootLayout({children}: {children: React.ReactNode}) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Login Server Action + page** — `web/src/app/(auth)/login/page.tsx`

```tsx
import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {signIn, auth} from '@/auth';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

export default async function LoginPage() {
  if (await auth()) redirect('/');
  const t = await getTranslations('auth');

  async function login(formData: FormData) {
    'use server';
    try {
      await signIn('credentials', {
        email: String(formData.get('email')),
        password: String(formData.get('password')),
        redirectTo: '/',
      });
    } catch (error) {
      // next-auth throws a redirect on success; rethrow those
      if (error && typeof error === 'object' && 'digest' in error) throw error;
      redirect('/login?error=1');
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={login} className="w-full max-w-sm space-y-4 rounded-xl border p-6">
        <h1 className="text-xl font-semibold">{t('signIn')}</h1>
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">{t('password')}</Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full">{t('signIn')}</Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 4: App shell** — `web/src/components/app-shell.tsx`

```tsx
import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {signOut} from '@/auth';
import {Button} from '@/components/ui/button';

export async function AppShell({children}: {children: React.ReactNode}) {
  const t = await getTranslations('nav');
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <nav className="flex items-center gap-4">
          <Link href="/" className="font-semibold">aaPanel Manager</Link>
          <Link href="/" className="text-sm text-muted-foreground">{t('servers')}</Link>
        </nav>
        <form action={async () => {'use server'; await signOut({redirectTo: '/login'});}}>
          <Button variant="ghost" size="sm" type="submit">{t('signOut')}</Button>
        </form>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 5: Authed layout + placeholder page** — `web/src/app/(app)/layout.tsx`

```tsx
import {redirect} from 'next/navigation';
import {auth} from '@/auth';
import {AppShell} from '@/components/app-shell';

export default async function AppLayout({children}: {children: React.ReactNode}) {
  if (!(await auth())) redirect('/login');
  return <AppShell>{children}</AppShell>;
}
```

`web/src/app/(app)/page.tsx`
```tsx
export default function DashboardPage() {
  return <p className="text-muted-foreground">Servers list — coming in Phase 2.</p>;
}
```

- [ ] **Step 6: Edge route protection** — `web/src/proxy.ts`

```ts
import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';

const PUBLIC = ['/login', '/api/auth'];

export function proxy(req: NextRequest) {
  const {pathname} = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  const hasSession =
    req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {matcher: '/((?!_next|favicon.ico|.*\\..*).*)'};
```
> Note: this is a coarse cookie presence check (defense-in-depth + redirect UX). Authoritative checks are the per-page `auth()`/guards. In Next.js 16 the middleware file is `proxy.ts`; if the running version still expects `middleware.ts`, rename accordingly (verify via context7 at execution).

- [ ] **Step 7: Verify build + manual flow**

Run: `pnpm build` → success.
Run: `pnpm dev`, open `/` → redirected to `/login`. (Login works after Task 12 seeds a user.)

- [ ] **Step 8: Commit**

```bash
git add web/ && git commit -m "feat(web): root layout, login, app shell, route protection, logger"
```

---

## Task 12: Seed admin user

**Files:**
- Create: `web/prisma/seed.ts`
- Modify: `web/package.json` (prisma seed config + script)

- [ ] **Step 1: Seed script** — `web/prisma/seed.ts`

```ts
import {PrismaClient, Role} from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'changeme123';
  const passwordHash = await argon2.hash(password, {type: argon2.argon2id});
  await prisma.user.upsert({
    where: {email},
    update: {},
    create: {email, passwordHash, role: Role.admin},
  });
  console.log(`Seeded admin: ${email}`);
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Configure seed in `web/package.json`**

```json
"prisma": {"seed": "tsx prisma/seed.ts"}
```

- [ ] **Step 3: Run seed**

Run: `SEED_ADMIN_EMAIL=admin@example.com SEED_ADMIN_PASSWORD=changeme123 pnpm prisma db seed`
Expected: "Seeded admin: admin@example.com".

- [ ] **Step 4: Manual login test**

Run: `pnpm dev`, go to `/login`, sign in with the seeded creds → redirected to `/` (dashboard placeholder via AppShell). Sign out works.

- [ ] **Step 5: Commit**

```bash
git add web/ && git commit -m "feat(web): admin user seed script"
```

---

## Task 13: Dual deploy (Docker + bare-metal) & E2E skeleton

**Files:**
- Create: `web/Dockerfile`, `web/.dockerignore`, `web/docker-compose.yml`, `web/playwright.config.ts`, `web/e2e/auth.spec.ts`, `web/README.md`

- [ ] **Step 1: `.dockerignore`**

```
node_modules
.next
.env
.git
```

- [ ] **Step 2: `web/Dockerfile`** (multi-stage, standalone)

```dockerfile
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=$PNPM_HOME:$PATH
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate && pnpm build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 3: `web/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: aapanel
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-devpass}
      POSTGRES_DB: aapanel_manager
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]
  app:
    build: .
    env_file: .env
    depends_on: [postgres]
    ports: ["3000:3000"]
    command: sh -c "pnpm prisma migrate deploy && node server.js"
  # worker service added in Phase 3
volumes:
  pgdata:
```
> Note: `command` needs pnpm+prisma present in the runner; for the migrate step use a small entrypoint or run `prisma migrate deploy` from the builder image. Refine the migrate-on-deploy mechanism in Phase 3 when the worker is added. For Phase 1, migrations can be run manually via `pnpm prisma migrate deploy`.

- [ ] **Step 4: Playwright E2E skeleton**

Run: `pnpm add -D @playwright/test && pnpm exec playwright install --with-deps chromium`
`web/playwright.config.ts`
```ts
import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: {baseURL: 'http://localhost:3000'},
  webServer: {command: 'pnpm dev', url: 'http://localhost:3000', reuseExistingServer: true},
});
```
`web/e2e/auth.spec.ts`
```ts
import {test, expect} from '@playwright/test';

test('unauthenticated user is redirected to login', async ({page}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', {name: /sign in|войти/i})).toBeVisible();
});
```

- [ ] **Step 5: Run E2E**

Run: `pnpm exec playwright test`
Expected: 1 passed (redirect to login).

- [ ] **Step 6: `web/README.md`** — document both run modes

Include: prerequisites (Node 24, pnpm, Postgres/Docker); env setup (`cp .env.example .env`, generate `AUTH_SECRET`/`APP_ENCRYPTION_KEY`); bare-metal (`pnpm install`, `pnpm prisma migrate dev`, `pnpm prisma db seed`, `pnpm dev`); production bare-metal (`pnpm build && pnpm start` + pm2/systemd); Docker (`docker compose up --build`). 

- [ ] **Step 7: Fix root `.gitignore` for the app lockfile**

Edit repo-root `.gitignore`: the app's lockfile MUST be committed. Add a negation so `web/pnpm-lock.yaml` is tracked:
```
!web/pnpm-lock.yaml
```
(Place after the existing `pnpm-lock.yaml` ignore line.)
Run: `git add -f web/pnpm-lock.yaml` if needed; confirm `git status` shows it tracked.

- [ ] **Step 8: Final verification**

Run (from `web/`): `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add web/ .gitignore && git commit -m "feat(web): Docker + bare-metal deploy, Playwright e2e, README, track lockfile"
```

---

## Self-Review (done by author)

- **Spec coverage:** Auth/roles (T8/T9), encrypted secrets primitive (T5), Postgres+Prisma model incl. Server/ServerStatus/AuditLog (T7), i18n RU/EN (T10), app shell + protected routes (T11), dual deploy (T13), Node 24 / Next 16 (T1), tests (T3/T5/T6/T8/T9/T13). Servers CRUD UI, worker, SSE, projects = **later phases** (by design).
- **Placeholders:** none — every code step has real content; the two `> Note:` items (compose migrate mechanism, middleware/proxy filename) flag version-sensitive details to verify at execution, not missing logic.
- **Type consistency:** `Role` from Prisma used in auth types, guards, seed; `SessionUser {id,email,role}` consistent across guards/auth callbacks; `encryptSecret/decryptSecret`, `hashPassword/verifyPassword`, `requireUser/requireAdmin`, `signInSchema` names consistent throughout.
