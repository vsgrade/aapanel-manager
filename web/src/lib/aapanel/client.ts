import {Agent, fetch as undiciFetch} from 'undici';
import {sign} from './signing';
import {
  AaPanelError,
  type AaPanelClientConfig,
  type SystemTotal,
  type ServerSnapshot,
  type ServerMetrics,
  type NodeProject,
  type ProjectOperation,
  type RunScript,
  type ProjectPreEnv,
  type NodeProjectConfig,
  type ProjectModifyInput,
  type ProjectCreateInput,
  type Database,
  type DbEngine,
  type DbCreateInput,
} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Reusable undici Agent that accepts self-signed panel certificates.
 *
 * `undici` is a declared dependency (web/package.json): it powers Node's global
 * fetch and exposes the `dispatcher` option — the only per-request way to skip
 * TLS verification (aaPanel ships self-signed certs by default). The agent is
 * created lazily and reused, and ONLY when an insecure request is actually made;
 * secure servers never construct it. There is intentionally no silent fallback:
 * a broken environment fails loudly rather than quietly sending verified-TLS
 * requests that the panel's self-signed cert would then reject.
 */
let insecureDispatcher: Agent | undefined;
function getInsecureDispatcher(): Agent {
  insecureDispatcher ??= new Agent({connect: {rejectUnauthorized: false}});
  return insecureDispatcher;
}

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
    return this.post<T>(`system?action=${encodeURIComponent(action)}`, extra);
  }

  /**
   * Generic signed POST to an arbitrary panel path (after baseUrl).
   * Signs the request with api_sk and sends application/x-www-form-urlencoded.
   * All Node.js project endpoints use this; /system endpoints delegate here via request().
   */
  private async post<T>(path: string, fields: Record<string, string> = {}): Promise<T> {
    const auth = sign(this.apiSk, Math.floor(Date.now() / 1000));
    const body = new URLSearchParams({...auth, ...fields});
    const url = `${this.baseUrl}/${path}`;

    let res: Response;
    try {
      // undici's own fetch is used (not Node's global fetch) so that the undici
      // Agent can be passed as `dispatcher` — Node's global fetch rejects an
      // npm-undici Agent with UND_ERR_INVALID_ARG, making insecureTLS a no-op.
      const init: Parameters<typeof undiciFetch>[1] = {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: body.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      };
      if (this.insecureTLS) init.dispatcher = getInsecureDispatcher();
      res = (await undiciFetch(url, init)) as unknown as Response;
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AaPanelError('timeout', `Request to ${path} timed out`);
      }
      const causeCode = (err as {cause?: {code?: string}}).cause?.code;
      const message = err instanceof Error ? err.message : 'Network error';
      throw new AaPanelError('network', `${message}${causeCode ? ` (${causeCode})` : ''}`);
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

  // ── Node.js project methods ──────────────────────────────────────────────

  /**
   * List Node.js projects with pagination, status, and CPU/RAM per project.
   *
   * Field mapping sourced from docs/en/nodejs-projects.md §get_project_list:
   *   run                              → true=running, false=stopped
   *   name                             → project name
   *   path                             → project directory
   *   project_config.port              → port
   *   load_info.<pid>.cpu_percent      → CPU usage % (summed across processes)
   *   load_info.<pid>.memory_used      → bytes → converted to MB
   *   load_info is empty {}            → project is stopped; cpu/mem = null
   */
  async listProjects(params: {p?: number; limit?: number; search?: string; re_order?: string} = {}): Promise<NodeProject[]> {
    const data = JSON.stringify({
      p: params.p ?? 1,
      limit: params.limit ?? 1000,
      search: params.search ?? '',
      re_order: params.re_order ?? '',
    });
    const raw = await this.post<{
      status: number;
      message: {
        data: Array<{
          name: string;
          path: string;
          run: boolean;
          project_config?: {port?: number};
          load_info?: Record<string, {cpu_percent?: number; memory_used?: number}>;
        }>;
      };
    }>('v2/project/nodejs/get_project_list', {data});

    return raw.message.data.map((p) => mapProject(p));
  }

  /**
   * Info about a single Node.js project.
   *
   * Field mapping sourced from docs/en/nodejs-projects.md §get_project_info.
   * Same shape as a list item; response is message (single object, no data[] wrapper).
   */
  async getProjectInfo(name: string): Promise<NodeProject> {
    const data = JSON.stringify({project_name: name});
    const raw = await this.post<{
      status: number;
      message: {
        name: string;
        path: string;
        run: boolean;
        project_config?: {port?: number};
        load_info?: Record<string, {cpu_percent?: number; memory_used?: number}>;
      };
    }>('v2/project/nodejs/get_project_info', {data});

    return mapProject(raw.message);
  }

  /**
   * Start, stop, or restart one or more Node.js projects.
   *
   * Field mapping sourced from docs/en/nodejs-projects.md §batch_operation_project.
   * FLAT body (no data= wrapper): project_names=<json-array> + operation_type.
   */
  async batchOperation(
    names: string[],
    op: ProjectOperation | 'delete',
  ): Promise<{msg: string; msg_list: Array<{name: string; status: boolean; msg: string}>}> {
    const raw = await this.post<{
      status: number;
      message: {msg: string; msg_list: Array<{name: string; status: boolean; msg: string}>};
    }>('v2/project/nodejs/batch_operation_project', {
      project_names: JSON.stringify(names),
      operation_type: op,
    });
    return raw.message;
  }

  /**
   * Run commands from the `scripts` section of a project's `package.json`.
   *
   * Source: docs/en/nodejs-projects.md §get_run_list.
   *   POST /v2/project/nodejs/get_run_list, body data={"project_cwd":"<path>"}
   *   Success: { status: 0, message: { "<key>": "<command>", ... } }
   *   Error  : { status: -1, message: { error_msg: "...", data: "..." } }
   *
   * Throws AaPanelError('panel_error') with the panel's error_msg when the
   * directory does not exist or has no readable package.json.
   */
  async getRunList(projectCwd: string): Promise<RunScript[]> {
    const data = JSON.stringify({project_cwd: projectCwd});
    const raw = await this.post<{
      status: number;
      message: Record<string, string> | {error_msg?: string; data?: string};
    }>('v2/project/nodejs/get_run_list', {data});

    if (raw.status !== 0) {
      const m = (raw.message ?? {}) as {error_msg?: string; data?: string};
      throw new AaPanelError('panel_error', m.error_msg || m.data || 'Failed to read package.json scripts');
    }
    const scripts = (raw.message ?? {}) as Record<string, string>;
    return Object.entries(scripts).map(([key, command]) => ({key, command: String(command)}));
  }

  /**
   * Node.js versions installed in the panel.
   * Source: docs/en/nodejs-projects.md §get_nodejs_version (data= empty).
   */
  async getNodeVersions(): Promise<string[]> {
    const raw = await this.post<{status: number; message: unknown}>(
      'v2/project/nodejs/get_nodejs_version',
      {data: ''},
    );
    if (raw.status !== 0 || !Array.isArray(raw.message)) {
      throw new AaPanelError('panel_error', 'Failed to read Node.js versions');
    }
    return raw.message.filter((v): v is string => typeof v === 'string');
  }

  /**
   * Metadata for the create-project form (Node versions, package managers,
   * system users, RAM cap).
   *
   * Source: docs/en/nodejs-projects.md §pre_env. NOTE the different path:
   * POST /v2/mod/nodejs/com/pre_env (no `data` field, auth fields only).
   */
  async getCreateEnv(): Promise<ProjectPreEnv> {
    const raw = await this.post<{
      status: number;
      message: {
        nodejs_versions?: unknown;
        package_managers?: unknown;
        user_list?: unknown;
        maximum_memory?: unknown;
      };
    }>('v2/mod/nodejs/com/pre_env');

    if (raw.status !== 0 || !raw.message || typeof raw.message !== 'object') {
      throw new AaPanelError('panel_error', 'Failed to read create-form metadata');
    }
    const m = raw.message;
    const strArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    return {
      nodejsVersions: strArray(m.nodejs_versions),
      packageManagers: strArray(m.package_managers),
      userList: strArray(m.user_list),
      maximumMemory: typeof m.maximum_memory === 'number' ? m.maximum_memory : 0,
    };
  }

  /**
   * Full configuration of a single project, for the edit form.
   * Reads `get_project_info` and pulls fields out of `project_config`.
   * Source: docs/en/nodejs-projects.md §get_project_info.
   */
  async getProjectConfig(name: string): Promise<NodeProjectConfig> {
    const data = JSON.stringify({project_name: name});
    const raw = await this.post<{
      status: number;
      message: {
        name?: string;
        path?: string;
        ps?: string;
        project_config?: {
          project_name?: string;
          project_cwd?: string;
          project_script?: string;
          port?: number;
          run_user?: string;
          nodejs_version?: string;
          project_ps?: string;
          is_power_on?: number;
          max_memory_limit?: number;
          domains?: string[];
        };
      };
    }>('v2/project/nodejs/get_project_info', {data});

    if (raw.status !== 0 || !raw.message) {
      throw new AaPanelError('panel_error', 'Failed to read project info');
    }
    const msg = raw.message;
    const cfg = msg.project_config ?? {};
    return {
      name: cfg.project_name ?? msg.name ?? name,
      cwd: cfg.project_cwd ?? msg.path ?? '',
      script: cfg.project_script ?? '',
      port: typeof cfg.port === 'number' ? cfg.port : null,
      runUser: cfg.run_user ?? '',
      nodejsVersion: cfg.nodejs_version ?? '',
      note: cfg.project_ps ?? msg.ps ?? '',
      powerOn: cfg.is_power_on === 1,
      maxMemoryLimit: typeof cfg.max_memory_limit === 'number' ? cfg.max_memory_limit : null,
      domains: Array.isArray(cfg.domains) ? cfg.domains : [],
    };
  }

  /**
   * Create a new Node.js project ("Default project" mode).
   * Source: docs/en/nodejs-projects.md §create_project.
   */
  async createProject(input: ProjectCreateInput): Promise<void> {
    const data = JSON.stringify({
      project_cwd: input.cwd,
      project_name: input.name,
      project_script: input.script,
      port: String(input.port),
      run_user: input.runUser,
      nodejs_version: input.nodejsVersion,
      project_ps: input.note,
      domains: input.domains,
      bind_extranet: input.bindExtranet ? 1 : 0,
      is_power_on: input.powerOn ? 1 : 0,
      max_memory_limit: input.maxMemoryLimit,
      project_env: input.env,
    });
    const raw = await this.post<{status: number; message: unknown}>(
      'v2/project/nodejs/create_project',
      {data},
    );
    this.assertProjectMutationOk(raw, 'Failed to create project');
  }

  /**
   * Modify an existing project's settings.
   * Source: docs/en/nodejs-projects.md §modify_project.
   */
  async modifyProject(input: ProjectModifyInput): Promise<void> {
    const data = JSON.stringify({
      project_cwd: input.cwd,
      project_name: input.name,
      project_script: input.script,
      port: String(input.port),
      run_user: input.runUser,
      nodejs_version: input.nodejsVersion,
      project_ps: input.note,
      is_power_on: input.powerOn ? 1 : 0,
    });
    const raw = await this.post<{status: number; message: unknown}>(
      'v2/project/nodejs/modify_project',
      {data},
    );
    this.assertProjectMutationOk(raw, 'Failed to modify project');
  }

  /**
   * Delete a project (removes it from the panel; the on-disk directory is
   * preserved). Goes through `batch_operation_project` with operation_type=delete.
   * Source: docs/en/nodejs-projects.md §batch_operation_project (delete).
   */
  async deleteProject(name: string): Promise<void> {
    const result = await this.batchOperation([name], 'delete');
    const item = result.msg_list?.[0];
    if (item && item.status === false) {
      throw new AaPanelError('panel_error', item.msg || 'Failed to delete project');
    }
  }

  /**
   * Asserts a create/modify project response succeeded. These return
   * { status, message: { status_code, error_msg, data } }: top-level
   * status must be 0 AND the inner status_code must not be negative.
   */
  private assertProjectMutationOk(
    raw: {status?: number; message?: unknown},
    fallback: string,
  ): void {
    if (raw?.status !== 0) {
      throw new AaPanelError('panel_error', this.extractProjectError(raw?.message) || fallback);
    }
    const m = raw.message;
    if (m && typeof m === 'object') {
      const obj = m as {status_code?: number; error_msg?: string};
      if (typeof obj.status_code === 'number' && obj.status_code < 0) {
        throw new AaPanelError('panel_error', obj.error_msg || fallback);
      }
    }
  }

  /** Best-effort extraction of a human message from a panel error payload. */
  private extractProjectError(message: unknown): string | null {
    if (typeof message === 'string') return message;
    if (message && typeof message === 'object') {
      const obj = message as {error_msg?: unknown; data?: unknown; result?: unknown};
      for (const v of [obj.error_msg, obj.result, obj.data]) {
        if (typeof v === 'string' && v) return v;
      }
    }
    return null;
  }

  /**
   * Retrieve PM2/build log for a Node.js project.
   *
   * Field mapping sourced from docs/en/nodejs-projects.md §Logs (§10):
   *   POST /v2/project/nodejs/get_project_log
   *   Body: data={"project_name":"<name>"}
   *   Response: { status: 0, message: { result: "<log text>" } }
   */
  async getProjectLogs(name: string): Promise<string> {
    const data = JSON.stringify({project_name: name});
    const raw = await this.post<{
      status: number;
      message: {result: string};
    }>('v2/project/nodejs/get_project_log', {data});
    return raw.message.result;
  }

  // ── Files (directory browsing) ─────────────────────────────────────────────

  /**
   * List the sub-directories of a path — backs the directory picker used when
   * creating a project. Source: docs/en/files.md §GetDirNew (flat body).
   * Returns only folder names (files are ignored here).
   */
  async listDir(path: string): Promise<{path: string; dirs: string[]}> {
    const raw = await this.post<{
      status: number;
      message: {path?: string; dir?: Array<{nm?: unknown}>} | string;
    }>('v2/files?action=GetDirNew', {
      path,
      is_operating: 'true',
      p: '1',
      showRow: '1000',
      disk: 'false',
    });

    if (raw.status !== 0 || !raw.message || typeof raw.message === 'string') {
      const msg = typeof raw.message === 'string' ? raw.message : 'Failed to list directory';
      throw new AaPanelError('panel_error', msg);
    }
    const dirs = (raw.message.dir ?? [])
      .map((d) => (typeof d?.nm === 'string' ? d.nm : ''))
      .filter((n) => n.length > 0)
      .sort((a, b) => a.localeCompare(b));
    return {path: raw.message.path ?? path, dirs};
  }

  // ── System monitoring ─────────────────────────────────────────────────────

  /**
   * Liveness + basic metrics.
   *
   * Field mapping sourced from docs/en/system-monitoring.md (real v8 panel response):
   *   cpuRealUsed  → CPU usage in % (float, e.g. 5.9)
   *   memTotal     → total RAM in MB (e.g. 5782)
   *   memRealUsed  → RAM actually used in MB (e.g. 1125)
   *   mem %        → (memRealUsed / memTotal) * 100
   */
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

  /**
   * Disk usage percent of the root mount ('/'), else the first parsable mount; null if none.
   *
   * Response shape sourced from docs/en/system-monitoring.md (real v8 panel):
   *   Array of { path, size: [total, used, free, "32%"] }
   *   size[3] is the use-percent string (e.g. "32%").
   */
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

  /**
   * One snapshot for the cache. System metrics are required (failure ⇒ caller treats server
   * offline); disk is best-effort (null on failure) so a flaky disk call never hides a
   * healthy server.
   */
  async collectStatus(): Promise<ServerSnapshot> {
    const sys = await this.getSystemTotal();
    let disk: number | null = null;
    try {
      disk = await this.getDiskInfo();
    } catch {
      disk = null;
    }
    return {online: sys.online, cpu: sys.cpu, mem: sys.mem, disk};
  }

  /**
   * Realtime network speeds and system load average.
   *
   * Field mapping sourced from docs/en/system-monitoring.md §GetNetWork (real panel):
   *   up   → upload speed, KB/s (top-level number)
   *   down → download speed, KB/s (top-level number)
   *   load → OBJECT {one, five, fifteen, max, limit, safe} — NOT an array
   *
   * Returns {up: null, down: null, load: null} if the request throws — callers
   * treat all network/load fields as best-effort.
   */
  private async getNetwork(): Promise<{up: number | null; down: number | null; load: {one: number; five: number; fifteen: number} | null}> {
    const raw = await this.request<{
      up?: unknown;
      down?: unknown;
      load?: {one?: unknown; five?: unknown; fifteen?: unknown} | null;
    }>('GetNetWork');
    const up = typeof raw.up === 'number' ? raw.up : null;
    const down = typeof raw.down === 'number' ? raw.down : null;
    let load: {one: number; five: number; fifteen: number} | null = null;
    if (raw.load !== null && typeof raw.load === 'object' && !Array.isArray(raw.load)) {
      const one = raw.load.one;
      const five = raw.load.five;
      const fifteen = raw.load.fifteen;
      if (typeof one === 'number' && typeof five === 'number' && typeof fifteen === 'number') {
        load = {one, five, fifteen};
      }
    }
    return {up, down, load};
  }

  /**
   * Rich server metrics for the Overview page.
   *
   * Field mapping sourced from docs/en/system-monitoring.md:
   *   GetSystemTotal: cpuRealUsed (cpu %), cpuNum (cores),
   *                   memTotal/memRealUsed (MB)
   *   GetDiskInfo:    size[3] → use% string e.g. "40%"
   *   GetNetWork:     up/down (top-level KB/s), load (object {one,five,fifteen})
   *
   * GetSystemTotal is REQUIRED — if it throws the caller treats the server as offline.
   * GetDiskInfo and GetNetWork are best-effort: failures produce null sub-metrics only.
   */
  // ── Database methods ──────────────────────────────────────────────────────

  /**
   * Unwraps the standard aaPanel envelope {status, message}.
   * Throws AaPanelError('panel_error') when status !== 0.
   */
  private unwrapEnvelope<T = {data?: unknown[]; result?: string}>(
    raw: {status?: number; message?: unknown},
  ): T {
    if (raw?.status !== 0) {
      const m = raw?.message;
      const msg =
        typeof m === 'string'
          ? m
          : m && typeof m === 'object' && 'result' in m
            ? String((m as {result: unknown}).result)
            : 'Operation failed';
      throw new AaPanelError('panel_error', msg);
    }
    return raw.message as T;
  }

  /**
   * List all databases across MySQL and PostgreSQL engines.
   *
   * Each engine is queried independently; a failure in one engine contributes
   * an empty array for that engine rather than throwing. Passwords are never
   * included in the normalized output.
   *
   * Field sources: docs/en/databases.md
   *   MySQL  POST /v2/data?action=getData  (flat body: table=databases&p=1&limit=...)
   *   PG     POST /v2/database/pgsql/get_list  (body: data=<JSON {p,limit,search,table}>)
   */
  async listDatabases(params: {p?: number; limit?: number; search?: string} = {}): Promise<Database[]> {
    const p = params.p ?? 1;
    const limit = params.limit ?? 1000;
    const search = params.search ?? '';

    const [mysqlRows, pgRows] = await Promise.all([
      (async (): Promise<Database[]> => {
        try {
          const raw = await this.post<{
            status: number;
            message: {
              data: Array<{
                id: number;
                name: string;
                username: string;
                password?: string;
                accept: string;
                ps: string;
                addtime: string;
                backup_count?: number;
              }>;
            };
          }>('v2/data?action=getData', {
            table: 'databases',
            p: String(p),
            limit: String(limit),
            search,
          });
          const msg = this.unwrapEnvelope<{data: typeof raw.message.data}>(raw);
          return (msg.data ?? []).map((r) => ({
            engine: 'mysql' as DbEngine,
            id: r.id,
            name: r.name,
            username: r.username,
            access: r.accept,
            note: r.ps,
            addtime: r.addtime,
            backupCount: r.backup_count ?? 0,
          }));
        } catch {
          return [];
        }
      })(),
      (async (): Promise<Database[]> => {
        try {
          const data = JSON.stringify({p, limit, search, table: 'databases'});
          const raw = await this.post<{
            status: number;
            message: {
              data: Array<{
                id: number;
                name: string;
                username: string;
                password?: string;
                accept: string;
                ps: string;
                addtime: string;
                type?: string;
                listen_ip: string;
                backup_count?: number;
              }>;
            };
          }>('v2/database/pgsql/get_list', {data});
          const msg = this.unwrapEnvelope<{data: typeof raw.message.data}>(raw);
          return (msg.data ?? []).map((r) => ({
            engine: 'pgsql' as DbEngine,
            id: r.id,
            name: r.name,
            username: r.username,
            access: r.listen_ip,
            note: r.ps,
            addtime: r.addtime,
            backupCount: r.backup_count ?? 0,
          }));
        } catch {
          return [];
        }
      })(),
    ]);

    return [...mysqlRows, ...pgRows];
  }

  /**
   * Create a MySQL or PostgreSQL database.
   *
   * Field sources: docs/en/databases.md
   *   MySQL POST /v2/database?action=AddDatabase (flat body)
   *   PG    POST /v2/database/pgsql/AddDatabase  (body: data=<JSON>)
   */
  async createDatabase(input: DbCreateInput): Promise<void> {
    const access = input.access ?? '127.0.0.1';
    const note = input.note ?? '';

    if (input.engine === 'pgsql') {
      const data = JSON.stringify({
        sid: 0,
        name: input.name,
        db_user: input.user,
        password: input.password,
        active: false,
        ssl: '',
        ps: note,
      });
      const raw = await this.post<{status: number; message: unknown}>(
        'v2/database/pgsql/AddDatabase',
        {data},
      );
      this.unwrapEnvelope(raw);
    } else {
      const charset = input.charset ?? 'utf8mb4';
      const raw = await this.post<{status: number; message: unknown}>(
        'v2/database?action=AddDatabase',
        {
          sid: '0',
          name: input.name,
          codeing: charset,
          db_user: input.user,
          password: input.password,
          dataAccess: access,
          address: access,
          active: 'false',
          ssl: '',
          ps: note,
          dtype: 'MySQL',
        },
      );
      this.unwrapEnvelope(raw);
    }
  }

  /**
   * Delete a MySQL or PostgreSQL database by id and name.
   *
   * Field sources: docs/en/databases.md
   *   MySQL POST /v2/database?action=DeleteDatabase (flat body: name=&id=)
   *   PG    POST /v2/database/pgsql/DeleteDatabase   (body: data=<JSON {id,name}>)
   */
  async deleteDatabase(engine: DbEngine, opts: {id: number; name: string}): Promise<void> {
    if (engine === 'pgsql') {
      const data = JSON.stringify({id: opts.id, name: opts.name});
      const raw = await this.post<{status: number; message: unknown}>(
        'v2/database/pgsql/DeleteDatabase',
        {data},
      );
      this.unwrapEnvelope(raw);
    } else {
      const raw = await this.post<{status: number; message: unknown}>(
        'v2/database?action=DeleteDatabase',
        {name: opts.name, id: String(opts.id)},
      );
      this.unwrapEnvelope(raw);
    }
  }

  async getMetrics(): Promise<ServerMetrics> {
    // Required: if GetSystemTotal fails, propagate — server is offline.
    const sys = await this.request<{
      cpuRealUsed?: number;
      cpuNum?: number;
      memTotal?: number;
      memRealUsed?: number;
    }>('GetSystemTotal');

    const cpuPercent = typeof sys.cpuRealUsed === 'number' ? sys.cpuRealUsed : null;
    const cores = typeof sys.cpuNum === 'number' ? sys.cpuNum : null;
    const memTotalMb = typeof sys.memTotal === 'number' ? sys.memTotal : null;
    const memUsedMb = typeof sys.memRealUsed === 'number' ? sys.memRealUsed : null;
    const memPercent =
      memTotalMb !== null && memTotalMb > 0 && memUsedMb !== null
        ? (memUsedMb / memTotalMb) * 100
        : null;

    // Best-effort: disk failure does not fail the whole metrics call.
    let diskPercent: number | null = null;
    try {
      diskPercent = await this.getDiskInfo();
    } catch {
      diskPercent = null;
    }

    // Best-effort: network/load failure produces null sub-metrics only.
    let netUpKbps: number | null = null;
    let netDownKbps: number | null = null;
    let load: {one: number; five: number; fifteen: number} | null = null;
    try {
      const net = await this.getNetwork();
      netUpKbps = net.up;
      netDownKbps = net.down;
      load = net.load;
    } catch {
      netUpKbps = null;
      netDownKbps = null;
      load = null;
    }

    return {cpuPercent, cores, load, memUsedMb, memTotalMb, memPercent, diskPercent, netUpKbps, netDownKbps};
  }
}

// ── Node.js project helpers ───────────────────────────────────────────────

/**
 * Raw project shape shared by get_project_list items and get_project_info message.
 * Docs: docs/en/nodejs-projects.md §1 and §2.
 */
interface RawNodeProject {
  name: string;
  path: string;
  /** true = running, false = stopped (docs/en/nodejs-projects.md §1 Key fields) */
  run: boolean;
  project_config?: {port?: number};
  /** Keyed by PID string; empty object when project is stopped. */
  load_info?: Record<string, {cpu_percent?: number; memory_used?: number}>;
}

/**
 * Maps a raw panel project record to a normalized NodeProject.
 *
 * status: branch on `run` (boolean), NOT on localized text.
 * cpu: sum of cpu_percent across all load_info entries (null when load_info is empty).
 * mem: sum of memory_used bytes across all entries, converted to MB (null when empty).
 */
function mapProject(p: RawNodeProject): NodeProject {
  const status = p.run === true ? 'running' : p.run === false ? 'stopped' : 'unknown';
  const port = p.project_config?.port ?? null;
  const path = p.path ?? null;

  const loadEntries = p.load_info ? Object.values(p.load_info) : [];
  let cpu: number | null = null;
  let mem: number | null = null;

  if (loadEntries.length > 0) {
    let totalCpu = 0;
    let totalMemBytes = 0;
    for (const entry of loadEntries) {
      if (typeof entry.cpu_percent === 'number') totalCpu += entry.cpu_percent;
      if (typeof entry.memory_used === 'number') totalMemBytes += entry.memory_used;
    }
    cpu = totalCpu;
    mem = totalMemBytes / (1024 * 1024); // bytes → MB
  }

  return {name: p.name, status, port, path, cpu, mem};
}
