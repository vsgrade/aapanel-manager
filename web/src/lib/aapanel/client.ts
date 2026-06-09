import {Agent} from 'undici';
import {sign} from './signing';
import {AaPanelError, type AaPanelClientConfig, type SystemTotal, type ServerSnapshot} from './types';

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
    const auth = sign(this.apiSk, Math.floor(Date.now() / 1000));
    const body = new URLSearchParams({...auth, ...extra});
    const url = `${this.baseUrl}/system?action=${encodeURIComponent(action)}`;

    let res: Response;
    try {
      // Node's global fetch accepts an undici `dispatcher` not present in the
      // standard RequestInit type; we type it explicitly and cast at the call.
      const init: RequestInit & {dispatcher?: Agent} = {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: body.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      };
      if (this.insecureTLS) init.dispatcher = getInsecureDispatcher();
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
}
