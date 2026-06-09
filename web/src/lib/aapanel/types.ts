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
