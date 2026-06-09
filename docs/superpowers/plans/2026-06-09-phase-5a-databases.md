# Phase 5a — Databases section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** A `/servers/[id]/databases` section listing databases from **both engines** (MySQL + PostgreSQL — different APIs), with create and delete. Admin-gated mutations + audit. DB passwords never reach the browser.

**Architecture:** Same pattern as Phase 4 projects: client methods on `AaPanelClient` (per-engine), Server Actions in `server/actions/databases.ts`, a section page + table + dialogs. Reads = `requireUser`, mutations = `requireAdmin` + `recordAudit`.

**Tech Stack:** Next.js 16, React 19, TS strict, Prisma v7, zod, shadcn (base-nova/Base UI — Dialog trigger `render=`), next-intl, undici (client TLS — already fixed to use `undici.fetch`), Vitest, pnpm. No new deps.

**Verified live (panel v8.0.1):** MySQL list `/v2/data?action=getData` (flat `table=databases&p&limit&search`) → `{status, message:{data:[...]}}`, currently 0 rows. PostgreSQL list `/v2/database/pgsql/get_list` (flat field `data=<JSON {p,limit,search,table:'databases'}>`) → 2 rows (`test22`, `taxitest`). **Both responses include `password` in plaintext — STRIP it in the client mapping.** Engine envelope: `status:0` = success.

**Reuses:** `AaPanelClient`/`createClientForServer`/`AaPanelError` (`@/lib/aapanel`); `requireUser`/`requireAdmin` (`@/lib/auth/guards`); `recordAudit`; `getServerForDetail` (`@/lib/servers/detail`); detail layout + `SectionNav` (Phase 4); dialog/table patterns from `server-form-dialog.tsx`/`projects-table.tsx`. `AaPanelClient.post(path, fields)` posts api_sk-signed flat form fields to `${baseUrl}/${path}` (handles both engines: MySQL flat fields, PG single `data` field).

**API reference:** `docs/en/databases.md` (exact MySQL/PG paths + bodies).

---

## Conventions
- Branch `feat/phase-5-databases` (created). TDD. Run pnpm from `web/`. Full gate (final task): `pnpm -C web test && pnpm -C web build && pnpm -C web typecheck && pnpm -C web lint`. Strict TS, no `any` w/o reason, no `console.log`, no secret leakage (DB passwords stripped; api_sk server-side only). LF. Commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## Task 1: client — database methods

**Files:** modify `web/src/lib/aapanel/{client,types,index}.ts`; extend `client.test.ts`.

- [ ] **Step 1: Types** (`types.ts`):
```ts
export type DbEngine = 'mysql' | 'pgsql';
export interface Database {
  engine: DbEngine;
  id: number;
  name: string;
  username: string;
  access: string; // mysql: accept · pgsql: listen_ip
  note: string;   // ps
  addtime: string;
  backupCount: number;
}
export interface DbCreateInput {
  engine: DbEngine;
  name: string;
  user: string;
  password: string;
  access?: string;  // default 127.0.0.1
  note?: string;
  charset?: string; // mysql only, default utf8mb4
}
```

- [ ] **Step 2: Failing tests** (`client.test.ts`, using the existing undici `fetch` mock):
  - `listDatabases()`: mock TWO responses (the MySQL `getData` envelope with empty `data`, then the PG `get_list` envelope with the captured 2-row body). Assert it returns 2 `Database` rows with `engine:'pgsql'`, names `test22`/`taxitest`, and **no `password` field** (`expect((row as Record<string,unknown>).password).toBeUndefined()`). Assert the MySQL request body contains `table=databases` and the PG body contains `data=`.
  - `listDatabases()` engine-isolation: if the MySQL fetch rejects, PG rows still return (and vice-versa) — `[]` for the failed engine, no throw.
  - `createDatabase({engine:'pgsql',...})`: mock `{status:0, message:{result:'Add_success'}}`; assert the POST path is `v2/database/pgsql/AddDatabase` and body contains `data=`. For `engine:'mysql'`: assert path `v2/database?action=AddDatabase` and flat fields (`dtype=MySQL`, `codeing=`).
  - `createDatabase` failure: mock `{status:-1, message:'name exists'}` → rejects with `AaPanelError` (kind `panel_error`) whose message includes `name exists`.
  - `deleteDatabase('pgsql',{id,name})`: mock `{status:0,message:{result:'Deleted successfully!'}}`; assert path `v2/database/pgsql/DeleteDatabase`. For mysql: path `v2/database?action=DeleteDatabase`, flat `name`+`id`.
  Run → FAIL.

- [ ] **Step 3: Implement** on `AaPanelClient` (verify paths/fields against `docs/en/databases.md`):
  - A private `unwrapEnvelope<T>(raw: {status?: number; message?: unknown}): <message>` — if `raw.status !== 0`, throw `new AaPanelError('panel_error', <readable message: message.result || message (string) || 'Operation failed'>)`; else return `raw.message`.
  - `listDatabases(): Promise<Database[]>`:
    - MySQL: `try { const m = unwrapEnvelope(await this.post('v2/data?action=getData', {table:'databases', p:'1', limit:'1000', search:''})); rows.push(...mapMysql(m.data)); } catch { /* engine absent/empty */ }`
    - PG: `try { const m = unwrapEnvelope(await this.post('v2/database/pgsql/get_list', {data: JSON.stringify({p:1, limit:1000, search:'', table:'databases'})})); rows.push(...mapPg(m.data)); } catch {}`
    - `mapMysql(d)` → `{engine:'mysql', id, name, username, access: accept, note: ps, addtime, backupCount: backup_count ?? 0}` (NO password). `mapPg(d)` → same but `access: listen_ip`, `engine:'pgsql'`.
  - `createDatabase(input)`: branch by engine:
    - mysql: `post('v2/database?action=AddDatabase', {sid:'0', name, codeing: input.charset||'utf8mb4', db_user: input.user, password: input.password, dataAccess: input.access||'127.0.0.1', address: input.access||'127.0.0.1', active:'false', ssl:'', ps: input.note||input.name, dtype:'MySQL'})`
    - pgsql: `post('v2/database/pgsql/AddDatabase', {data: JSON.stringify({sid:0, name: input.name, db_user: input.user, password: input.password, active:false, ssl:'', ps: input.note||input.name})})`
    - `unwrapEnvelope(...)` to throw on failure; return void.
  - `deleteDatabase(engine, {id, name})`:
    - mysql: `post('v2/database?action=DeleteDatabase', {name, id: String(id)})`
    - pgsql: `post('v2/database/pgsql/DeleteDatabase', {data: JSON.stringify({id, name})})`
    - `unwrapEnvelope`.
  - Re-export `Database`, `DbEngine`, `DbCreateInput` in `index.ts`.

- [ ] **Step 4: Run → PASS**; full `pnpm -C web test`.
- [ ] **Step 5: Commit** `feat(db): aaPanel database methods (MySQL + PostgreSQL)`.

---

## Task 2: validation + server actions

**Files:** create `web/src/lib/validation/database.ts`, `web/src/server/actions/databases.ts`; test `web/src/server/actions/databases.test.ts`.

- [ ] **Step 1: validation** (`database.ts`): `databaseCreateSchema` (zod): `engine: z.enum(['mysql','pgsql'])`, `name`: trimmed, 1..64, regex `^[A-Za-z0-9_]+$` (safe DB identifier), `user`: same rules, `password`: 1..128, `access`: optional default '127.0.0.1', `note`: optional max 100, `charset`: optional. `databaseDeleteSchema`: `engine`, `id: z.coerce.number().int()`, `name: z.string().min(1)`, `confirm: z.string()` (must equal name — validated in the action or via refine). Export inferred types.

- [ ] **Step 2: Failing tests** (`databases.test.ts`, mirror `projects.test.ts` mocks: `@/auth`, guards w/ `guard` role, `@/lib/aapanel` `createClientForServer` → `{listDatabases, createDatabase, deleteDatabase}`, `next/cache`; real test DB for the Server row + audit). Assert:
  - `listDatabasesAction(serverId)` → `{ok:true, databases:[...]}` (mock returns 1 row).
  - `createDatabaseAction` (admin, valid) → ok + audit `db.create`; (viewer) → forbidden, no client call; (invalid name e.g. `bad name!`) → `{ok:false, fieldErrors}`.
  - `deleteDatabaseAction` (admin, confirm === name) → ok + audit `db.delete`; (confirm !== name) → `{ok:false}` and client.deleteDatabase NOT called.
  Run → FAIL.

- [ ] **Step 3: Implement** `databases.ts` (`'use server'`): mirror `projects.ts` (loadServerCreds, describeError, role guards, audit, `revalidatePath('/servers/'+id+'/databases')`). Actions: `listDatabasesAction` (requireUser), `createDatabaseAction(serverId, FormData)` (requireAdmin → zod parse → `client.createDatabase(parsed)` → audit → ok/fieldErrors), `deleteDatabaseAction(serverId, FormData)` (requireAdmin → zod parse → check `confirm===name` else `{ok:false,message:'confirm'}` → `client.deleteDatabase(engine,{id,name})` → audit). Result unions like Phase 4.
- [ ] **Step 4: Run → PASS**; full suite.
- [ ] **Step 5: Commit** `feat(db): server actions + zod for database CRUD`.

---

## Task 3: section UI (page + table + dialogs + nav + i18n)

**Files:** create `web/src/app/(app)/servers/[id]/databases/page.tsx`; `web/src/components/servers/detail/databases-table.tsx`, `database-form-dialog.tsx`, `database-delete-dialog.tsx`; modify `web/src/components/servers/detail/section-nav.tsx` (enable Databases link); `web/messages/{ru,en}.json` (`databases` namespace).

- [ ] **Step 1: page.tsx** (RSC): `requireUser`; `listDatabasesAction(id)`; render `<DatabasesTable id={id} initial={...} isAdmin={...}/>`.
- [ ] **Step 2: databases-table.tsx** (client): shadcn `Table` (counts small, no TanStack). Columns: name, engine (badge: mysql/pgsql), username, access, note, addtime, actions. Toolbar: engine filter (all/mysql/pgsql, client-side), Refresh, and Add (admin) → `<DatabaseFormDialog/>`. Row delete (admin) → `<DatabaseDeleteDialog/>`. `refetch()` via `listDatabasesAction`. Error/empty states.
- [ ] **Step 3: database-form-dialog.tsx** (client): shadcn Dialog (`render={trigger}`), form via `useTransition` + direct `createDatabaseAction` call (NOT useActionState — avoids set-state-in-effect, per `server-form-dialog.tsx` pattern). Fields: engine `<select>` (mysql/pgsql), name, user, password (type=password), access (default 127.0.0.1), note; charset shown only when engine=mysql. Inline field errors from result; on ok → toast + close + refetch.
- [ ] **Step 4: database-delete-dialog.tsx** (client): Dialog; requires typing the DB name to enable the destructive Confirm (`confirm` field sent to action); shows engine+name; on ok → toast + close + refetch.
- [ ] **Step 5: section-nav.tsx**: turn the disabled `Databases` placeholder into an active `<Link href={\`/servers/${id}/databases\` as Route}>` (keep the other placeholders disabled).
- [ ] **Step 6: i18n** `databases` namespace (RU+EN parity): title, add, engine, mysql, pgsql, all, name, user, password, access, note, charset, addtime, actions, delete, cancel, create, refresh, noDatabases, loadFailed, confirmDeleteLabel (e.g. "Type the database name to confirm"), created, deleted, search.
- [ ] **Step 7: Verify** `pnpm -C web build` + `pnpm -C web test` + `pnpm -C web lint` (0 errors). Commit `feat(db): databases section UI (table, create/delete dialogs, nav, i18n)`.

---

## Task 4: full verify + live smoke + docs + memory + review + finish

- [ ] **Step 1: Full gate** — test/build/typecheck/lint all green.
- [ ] **Step 2: LIVE SMOKE (controller, against the user's panel)** — the controller writes a temp script using the real client to: `listDatabases()` (expect `test22`/`taxitest` pgsql), `createDatabase({engine:'pgsql', name:'apptest_<rand>', user, password})`, re-list (expect the new DB), `deleteDatabase('pgsql', {id, name})`, re-list (gone). Verify api_sk works for create/delete (not just list). Delete the temp script (holds the key). Report results. (MySQL has 0 DBs; optionally create+delete a MySQL test DB too.) If anything mismatches the documented body/shape, fix the client mapping + tests.
- [ ] **Step 3: Docs** — spec §15 note Phase 5 started (Databases ✅); `docs/project-index.md` + `docs/NAVIGATION.md` add the databases section/actions/client methods. Commit.
- [ ] **Step 4: Final review** — reviewer over `git diff main...HEAD` (focus: no DB-password leakage to client/logs; role gating + audit on create/delete; per-engine body correctness; delete confirm enforced server-side; envelope error handling). Fix findings.
- [ ] **Step 5:** `superpowers:finishing-a-development-branch`; update memory (Databases section done + any live-capture corrections).

---

## Self-Review
- Both engines listed + merged (unified table) → T1, T3. Passwords stripped → T1. Create/delete per engine → T1–T3. Roles+audit → T2. Delete confirm (type name) → T2 (server) + T4-dialog (UI). i18n RU/EN → T3. Live smoke incl. create/delete → T4. No new deps. Envelope (`status:0`) handled → T1. Type consistency: `Database`/`DbEngine`/`DbCreateInput` across client→action→UI.

## Execution Handoff
subagent-driven-development on `feat/phase-5-databases`; live smoke on the user's panel; finish with finishing-a-development-branch.
