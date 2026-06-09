# Phase 4 — Server Overview + Projects (Node) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A per-server detail route `/servers/[id]` with an **Overview** tab (live metrics, fast-polled while open) and a **Projects** tab (Node.js projects: list + status/CPU/RAM, start/stop/restart, logs). Architected so more project types (PHP/WP/Proxy/Python/Go) and sections (DB/Files/FTP/Cron/Firewall) slot in later.

**Architecture:** Level-2 IA (spec §9). `/servers/[id]` layout with a left section-nav (Overview, Projects active; DB/Files/FTP/Cron/Firewall = disabled placeholders for Phase 5). All detail data is **live** via Server Actions through `createClientForServer` (decrypt server-side). The **active-server fast poll (~4s)** deferred from Phase 3 is implemented as **client-side polling of a metrics Server Action** while the Overview tab is open (the global table stays on worker + SSE cadence). Mutations (start/stop/restart) require **admin** + audit; reads (metrics/list/logs) require an authenticated user.

**Tech Stack:** Next.js 16 (App Router, RSC, Server Actions, dynamic route segment), React 19 (`useTransition`, `useEffect` polling), TypeScript strict, Prisma v7, Tailwind/shadcn, next-intl, Vitest, pnpm, Node 24. **No new dependencies.**

**Scope (Phase 4):** detail route + Overview (live metrics) + Node Projects (list + start/stop/restart + logs + info). **Deferred:** PHP/WP & Proxy/Python/Go project types (user chose Node-only now; capture other-type APIs from the live panel just-in-time later); DB/Files/FTP/Cron/Firewall sections (Phase 5); `projectCount` in the global cache table (shown live on the detail page instead).

**Reuses:** `@/lib/aapanel` (`AaPanelClient`, `createClientForServer`, `AaPanelError`); `@/lib/auth/guards` (`requireUser`/`requireAdmin`); `@/lib/audit` (`recordAudit`); `@/lib/db/prisma`; `@/log` (`log`); next-intl messages `web/messages/{ru,en}.json`; the servers table/components from Phase 2.

**API references (verify exact field names against these; adapt mapping + test fixtures together):**
- `docs/en/system-monitoring.md` — `GetSystemTotal`, `GetDiskInfo`, `GetNetWork` response shapes.
- `docs/en/nodejs-projects.md` — Node project list/info/scripts/versions/start-stop/logs.
- `examples/javascript/aapanel-client.ts` — `listProjects`/`getProjectInfo`/`getRunList`/`batchOperation` (api_sk paths). `api_sk` is confirmed to cover `/v2/project/nodejs/*`.

---

## Conventions
- Branch `feat/phase-4-overview-projects` (created/checked out). TDD: failing test → fail → implement → pass → commit. Run pnpm from `web/`. Full gate (final task): `pnpm -C web test && pnpm -C web build && pnpm -C web typecheck && pnpm -C web lint`.
- Strict TS, no `any` without reason, no swallowed errors, no `console.log`, secrets never logged/sent to client. LF endings. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Roles: reads (metrics/list/logs) → `requireUser`; mutations (start/stop/restart) → `requireAdmin` + `recordAudit`.

---

## File Structure
**Create:**
- `web/src/lib/aapanel/projects.ts` (or extend `client.ts`) — Node project methods + `NodeProject` type. (Decide: add methods to `AaPanelClient` in `client.ts` and types in `types.ts` — preferred for cohesion.)
- `web/src/lib/aapanel/metrics.ts` — N/A (put `getMetrics` on the client too).
- `web/src/server/actions/projects.ts` — `getServerMetricsAction`, `listNodeProjectsAction`, `projectControlAction`, `getProjectLogsAction`.
- `web/src/lib/servers/detail.ts` — `getServerForDetail(id)` (name/id for header; never apiSkEnc).
- `web/src/app/(app)/servers/[id]/layout.tsx`, `page.tsx` (Overview), `projects/page.tsx`, `not-found.tsx`.
- `web/src/components/servers/detail/section-nav.tsx`, `server-overview.tsx` (client, live), `metric-bar.tsx`, `projects-table.tsx` (client), `project-logs-dialog.tsx` (client).
**Modify:**
- `web/src/lib/aapanel/{client,types,index}.ts` — add metrics + project methods/types.
- `web/src/components/servers/columns.tsx` — make the `name` cell a link to `/servers/[id]`.
- `web/messages/{ru,en}.json` — add `overview` + `projects` namespaces.
- Docs (final task): spec §15, project-index, NAVIGATION, memory.

---

## Task 1: client — server metrics (`getMetrics`)

**Files:** modify `web/src/lib/aapanel/types.ts`, `client.ts`, `index.ts`; extend `client.test.ts`.

> Verify `GetSystemTotal`/`GetNetWork` fields against `docs/en/system-monitoring.md`. `GetSystemTotal` includes cpu, memory (memTotal/memRealUsed/...), `cpuNum` (cores), `load` (1/5/15 avg). `GetNetWork` returns up/down totals + speeds. Adapt mapping + fixtures to the real shapes.

- [ ] **Step 1: Add `ServerMetrics` type** (`types.ts`):
```ts
export interface ServerMetrics {
  cpuPercent: number | null;
  cores: number | null;
  load: {one: number; five: number; fifteen: number} | null;
  memUsedMb: number | null;
  memTotalMb: number | null;
  memPercent: number | null;
  diskPercent: number | null;
  netUpKbps: number | null;
  netDownKbps: number | null;
}
```
- [ ] **Step 2: Failing test** (append to `client.test.ts`) — mock `fetch` so `GetSystemTotal` returns cpu/mem/cores/load, `GetDiskInfo` returns mounts, `GetNetWork` returns up/down; assert `getMetrics()` maps `cpuPercent`, `memPercent`, `diskPercent`, `cores`, `load`, and that a failing `GetNetWork` yields `netUp/DownKbps: null` (best-effort) without failing the whole call. Run → FAIL.
- [ ] **Step 3: Implement** `getNetwork()` (private, returns `{up, down}` Kbps or nulls) and `getMetrics()` on `AaPanelClient`: call `GetSystemTotal` (required; throws ⇒ caller shows offline), then `GetDiskInfo` + `GetNetWork` best-effort (null on throw). Reuse the existing `request<T>()`. Map per docs. Add `ServerMetrics` to `index.ts` re-exports.
- [ ] **Step 4: Run → PASS**; full `pnpm -C web test`.
- [ ] **Step 5: Commit** `feat(detail): aaPanel getMetrics (cpu/mem/disk/network/load)`.

---

## Task 2: client — Node projects

**Files:** modify `types.ts`, `client.ts`, `index.ts`; extend `client.test.ts`.

> Verify against `docs/en/nodejs-projects.md` + `examples/javascript/aapanel-client.ts`. Endpoints (api_sk): `POST /v2/project/nodejs/get_project_list` (body `data=<json>` with `{p,limit,search,re_order}`), `.../get_project_info` (`data={project_name}`), `.../batch_operation_project` (FLAT body: `project_names=<json-array>` + `operation_type`), and the project-log endpoint (confirm its exact action/path + body in the docs). Note the special flat body for batch ops (no `data=` wrapper).

- [ ] **Step 1: Add types** (`types.ts`):
```ts
export type ProjectOperation = 'start' | 'stop' | 'restart';
export interface NodeProject {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  port: number | null;
  path: string | null;
  cpu: number | null;
  mem: number | null; // MB
}
```
- [ ] **Step 2: Failing tests** (`client.test.ts`): mock `fetch` for `get_project_list` → assert `listProjects()` returns normalized `NodeProject[]` (status mapped by the panel's status field, NOT localized text); for `batch_operation_project` → assert `batchOperation(['a'],'start')` sends a flat body containing `project_names=` (JSON array) + `operation_type=start` (no `data=` wrapper). Run → FAIL.
- [ ] **Step 3: Implement** on `AaPanelClient`: `listProjects()`, `getProjectInfo(name)`, `batchOperation(names, op)` (start/stop/restart), `getProjectLogs(name)`. Map the list to `NodeProject` (derive `status` from the numeric/boolean status field per docs — branch on the field, not on RU/EN text). Add a `requestNode(method, data)` helper if useful (wraps `data=<json>`), but batch ops use the flat body. Re-export `NodeProject`/`ProjectOperation` in `index.ts`.
- [ ] **Step 4: Run → PASS**; full suite.
- [ ] **Step 5: Commit** `feat(detail): aaPanel Node project methods (list/info/control/logs)`.

---

## Task 3: server actions — metrics + projects

**Files:** create `web/src/server/actions/projects.ts`, `web/src/lib/servers/detail.ts`; test `web/src/server/actions/projects.test.ts` (integration: mocked client + test DB + role checks).

- [ ] **Step 1: Failing tests** (`projects.test.ts`) — mirror the Phase 2 actions test setup (mock `@/auth`, `@/lib/auth/guards` with a `guard` role, `@/lib/aapanel` `createClientForServer` returning `{getMetrics, listProjects, batchOperation, getProjectLogs}`, `next/cache`). Assert:
  - `getServerMetricsAction(id)` returns `{ok:true, metrics}` for an authed user; `{ok:false}` when the client throws (server offline).
  - `listNodeProjectsAction(id)` returns `{ok:true, projects}`.
  - `projectControlAction(id, 'app', 'stop')` as **admin** → ok + writes an audit row (`action: 'project.stop'`, target `app`); as **viewer** → `{ok:false}` (forbidden) and NO panel call.
  - `getProjectLogsAction(id, 'app')` returns logs for an authed user.
  Run → FAIL.
- [ ] **Step 2: Implement** `web/src/lib/servers/detail.ts`:
```ts
import 'server-only';
import {prisma} from '@/lib/db/prisma';
export async function getServerForDetail(id: string) {
  return prisma.server.findUnique({where: {id}, select: {id: true, name: true, tag: true, baseUrl: true}});
}
```
And `web/src/server/actions/projects.ts` (`'use server'`): each action loads the server (select `baseUrl/apiSkEnc/insecureTLS`), builds the client, calls the method, normalizes errors via a local `describeError` (reuse the pattern from `servers.ts`), and returns a typed discriminated result. `projectControlAction` calls `requireAdmin` first and `recordAudit({action: \`project.${op}\`, target: projectName, serverId, userId})` on both success and failure; reads call `requireUser`. Result types:
```ts
export type MetricsResult = {ok: true; metrics: ServerMetrics} | {ok: false; message: string};
export type ProjectsResult = {ok: true; projects: NodeProject[]} | {ok: false; message: string};
export type ControlResult = {ok: boolean; message: string};
export type LogsResult = {ok: true; logs: string} | {ok: false; message: string};
```
No `revalidatePath` needed for metrics/list (client refetches); after `projectControlAction`, optionally `revalidatePath(\`/servers/${id}/projects\`)`.
- [ ] **Step 3: Run → PASS**; full suite.
- [ ] **Step 4: Commit** `feat(detail): server actions for metrics, project list/control/logs`.

---

## Task 4: detail route layout + section nav

**Files:** create `web/src/app/(app)/servers/[id]/layout.tsx`, `not-found.tsx`; `web/src/components/servers/detail/section-nav.tsx`.

- [ ] **Step 1: `layout.tsx`** (RSC): `params: Promise<{id: string}>`; `requireUser()`; `const server = await getServerForDetail(id); if (!server) notFound();`. Render a header (breadcrumb: «Серверы» → server.name, with `baseUrl`/tag subtitle) + `<SectionNav id={id} isAdmin={...}/>` + `{children}`. Get `isAdmin` from `requireUser()`.
- [ ] **Step 2: `section-nav.tsx`** (client): links Overview (`/servers/[id]`), Projects (`/servers/[id]/projects`), and disabled items (Databases/Files/FTP/Cron/Firewall) shown muted with a "soon" hint. Active link styling via `usePathname`. i18n labels.
- [ ] **Step 3: `not-found.tsx`** — simple "server not found" with a link back to `/servers`.
- [ ] **Step 4: Verify** `pnpm -C web build`.
- [ ] **Step 5: Commit** `feat(detail): /servers/[id] layout + section nav`.

---

## Task 5: Overview tab (live metrics)

**Files:** create `web/src/app/(app)/servers/[id]/page.tsx`, `web/src/components/servers/detail/server-overview.tsx`, `metric-bar.tsx`; `loading.tsx`, `error.tsx` for the segment.

- [ ] **Step 1: `page.tsx`** (RSC, Overview default tab): `requireUser`; fetch initial metrics via `getServerMetricsAction(id)`; render `<ServerOverview id={id} initial={result} />`.
- [ ] **Step 2: `server-overview.tsx`** (client): props `{id, initial}`. Holds metrics state seeded from `initial`. `useEffect` sets an interval (~4000ms) that calls `getServerMetricsAction(id)` (in a `useTransition` or guarded async) and updates state; cleanup clears the interval; pause when `document.hidden` (don't poll a backgrounded tab). On `{ok:false}` show an offline/error banner but keep last-known values dimmed. Render metric cards using `<MetricBar/>` for CPU%, RAM% (with used/total MB), Disk%, plus Network up/down, cores, load avg, uptime.
- [ ] **Step 3: `metric-bar.tsx`** (client/pure): a labeled progress bar (value%, color thresholds e.g. green/amber/red), accessible (`role="progressbar"`, aria values). Small pure helper `barColor(pct)` — unit-test it.
- [ ] **Step 4: Failing test** for `barColor` (e.g., 10→ok, 75→warn, 95→crit). Implement, run → PASS.
- [ ] **Step 5: `loading.tsx`/`error.tsx`** for the segment (skeleton + retry).
- [ ] **Step 6: Verify** `pnpm -C web build`.
- [ ] **Step 7: Commit** `feat(detail): server Overview with live metric polling`.

---

## Task 6: Projects tab (Node)

**Files:** create `web/src/app/(app)/servers/[id]/projects/page.tsx`, `web/src/components/servers/detail/projects-table.tsx`, `project-logs-dialog.tsx`.

- [ ] **Step 1: `projects/page.tsx`** (RSC): `requireUser`; fetch `listNodeProjectsAction(id)`; render `<ProjectsTable id={id} initial={result} isAdmin={isAdmin}/>`.
- [ ] **Step 2: `projects-table.tsx`** (client): a compact shadcn `Table` (counts are small — no TanStack/pagination needed). Columns: name, status badge (reuse `StatusBadge` mapping or a project-status variant), port, CPU%, RAM (MB), actions. Row actions (admin only): Start/Stop/Restart (disabled per current status — e.g. Start disabled when running) calling `projectControlAction(id, name, op)` in a `useTransition`; on result, toast + refetch the list via `listNodeProjectsAction(id)` (update local state) or `router.refresh()`. Logs button (all users) opens `<ProjectLogsDialog/>`. Has a manual "Refresh" button. Empty state when no projects.
- [ ] **Step 3: `project-logs-dialog.tsx`** (client): shadcn `Dialog`; on open, calls `getProjectLogsAction(id, name)` in a transition; shows logs in a scrollable `<pre>` (monospace, max-height, preserve whitespace); a refresh button; handles `{ok:false}` with an error line. Never render logs as HTML (text only).
- [ ] **Step 4: Verify** `pnpm -C web build`.
- [ ] **Step 5: Commit** `feat(detail): Node projects table with control actions + logs`.

---

## Task 7: link servers table → detail

**Files:** modify `web/src/components/servers/columns.tsx`.

- [ ] **Step 1:** Make the `name` column cell a `next/link` `<Link href={\`/servers/${row.original.id}\`}>` (styled as a link; keep it accessible). Keep sorting on the column working (the header sort button is separate from the cell link).
- [ ] **Step 2:** `pnpm -C web build` + `pnpm -C web test` green.
- [ ] **Step 3: Commit** `feat(detail): link server name to its detail page`.

---

## Task 8: i18n

**Files:** modify `web/messages/ru.json`, `web/messages/en.json`.

- [ ] **Step 1:** Add `overview` (cpu, memory, disk, network, cores, load, uptime, up, down, offline, retry, lastUpdated…) and `projects` (title, name, status, port, cpu, mem, running, stopped, unknown, start, stop, restart, logs, refresh, noProjects, confirmStop?, started/stopped/restarted toasts, logsTitle, logsEmpty, actions, soon…) namespaces in BOTH files, RU + EN parity. Also `detail` (nav labels: overview, projects, databases, files, ftp, cron, firewall, soon, notFound, backToServers).
- [ ] **Step 2:** `pnpm -C web build` (no missing-key crashes — next-intl renders key as fallback anyway). Commit `feat(detail): RU/EN i18n for overview/projects/detail nav`.

---

## Task 9: full verify + e2e + docs + memory + review + finish

- [ ] **Step 1: Full gate** — `pnpm -C web test && pnpm -C web build && pnpm -C web typecheck && pnpm -C web lint`. All green (0 lint errors).
- [ ] **Step 2: E2E** (`web/e2e/server-detail.spec.ts`) — login admin → add a server (placeholder URL) → click its name → land on `/servers/[id]` Overview → see the offline/error banner (no live panel in e2e) → open Projects tab → see error/empty state → delete the server (cleanup). Asserts navigation + role-independent rendering without depending on a live panel. (Do NOT assert live metrics in e2e.)
- [ ] **Step 3: MANUAL SMOKE (requires the user's live panel)** — the controller will coordinate: add the user's real test panel as a server (via the app UI with its `api_sk`, or the user provides browser access), then verify Overview shows real CPU/RAM/disk/network updating ~4s, the Projects tab lists real Node projects, and Start/Stop/Restart + Logs work end-to-end. Report observations honestly; if the panel is unavailable at this step, say so and mark live verification pending.
- [ ] **Step 4: Docs** — spec §15 mark Phase 4 ✅ (Overview + Node Projects + detail route + active-server fast-poll done; PHP/WP & Proxy/Python/Go & other sections deferred); update `docs/project-index.md` (detail route, projects/metrics actions, client methods) + `docs/NAVIGATION.md` (Phase 4 plan link + detail route pointers). Commit.
- [ ] **Step 5: Final review** — dispatch a reviewer over `git diff main...HEAD` (focus: role gating on control actions + audit; no secret leakage in metrics/logs/log lines; logs rendered as text not HTML; polling cleanup + hidden-tab pause; offline/error states; type consistency `ServerMetrics`/`NodeProject`). Fix findings.
- [ ] **Step 6:** `superpowers:finishing-a-development-branch`.

---

## Self-Review (plan vs. design)
- Detail route `/servers/[id]` + section nav → Tasks 4. ✅
- Overview live metrics + active-server ~4s client poll (deferred from Phase 3) → Tasks 1,3,5. ✅
- Node Projects: list + start/stop/restart + logs + info, admin-gated mutations + audit → Tasks 2,3,6. ✅
- Node-only now; other types/sections deferred; `projectCount` shown live not in cache → scope notes. ✅
- Secrets: actions decrypt server-side, select only creds; logs/metrics never include `api_sk`; client never receives secrets → Tasks 3. ✅
- Type consistency: `ServerMetrics` (T1) ↔ metrics action/Overview; `NodeProject`/`ProjectOperation` (T2) ↔ projects action/table. Checked.
- No new dependencies. ✅
- Live verification needs the user's panel (flagged in T9 step 3) — honest about automated vs manual coverage.

## Execution Handoff
subagent-driven-development on `feat/phase-4-overview-projects`; finish with finishing-a-development-branch + manual smoke against the user's live panel.
