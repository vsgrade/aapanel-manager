export type AaPanelErrorKind = 'network' | 'timeout' | 'auth' | 'panel_error';

export type ProjectOperation = 'start' | 'stop' | 'restart';

export interface NodeProject {
  name: string;
  status: 'running' | 'stopped' | 'unknown';
  port: number | null;
  path: string | null;
  cpu: number | null;
  mem: number | null; // MB
}

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

/** Combined server snapshot including disk usage. */
export interface ServerSnapshot {
  online: boolean;
  cpu: number | null; // percent 0..100
  mem: number | null; // percent 0..100
  disk: number | null; // percent 0..100, best-effort (null on failure)
}

/**
 * Rich server metrics for the Overview page.
 * Field sources: docs/en/system-monitoring.md (GetSystemTotal, GetDiskInfo, GetNetWork).
 * Nulls indicate the sub-metric was unavailable (best-effort fields: disk, network, load).
 */
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
