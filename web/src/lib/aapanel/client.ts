import {sign} from './signing';
import {AaPanelError, type AaPanelClientConfig, type SystemTotal} from './types';

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Lazily creates a single reusable undici Agent with TLS verification disabled.
 * Dynamic import avoids a hard dependency at module load time.
 * Returns undefined when undici is unavailable (e.g. in test environments
 * where fetch is fully mocked and the dispatcher is irrelevant).
 */
let insecureDispatcher: unknown;
async function getInsecureDispatcher(): Promise<unknown> {
  if (!insecureDispatcher) {
    try {
      // undici ships with Node.js 18+; no package.json entry needed.
      const {Agent} = await import('undici');
      insecureDispatcher = new Agent({connect: {rejectUnauthorized: false}});
    } catch {
      // undici unavailable — dispatcher will be omitted; only affects real TLS
      return undefined;
    }
  }
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
      const init: Record<string, unknown> = {
        method: 'POST',
        headers: {'content-type': 'application/x-www-form-urlencoded'},
        body: body.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      };
      if (this.insecureTLS) {
        // Node.js fetch (undici-based) accepts a `dispatcher` option not in the
        // standard RequestInit type — cast via a plain object then back.
        const dispatcher = await getInsecureDispatcher();
        if (dispatcher !== undefined) {
          init.dispatcher = dispatcher;
        }
      }
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
}
