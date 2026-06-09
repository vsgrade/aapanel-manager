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
    // Real aaPanel GetSystemTotal fields (confirmed via docs/en/system-monitoring.md + examples/javascript/aapanel-client.ts):
    // cpuRealUsed = CPU %, memTotal/memRealUsed = MB; mem% = memRealUsed/memTotal*100
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({cpuRealUsed: 12.5, memTotal: 1000, memRealUsed: 250}),
    );
    const client = new AaPanelClient(cfg);
    const out = await client.getSystemTotal();
    expect(out.online).toBe(true);
    expect(out.cpu).toBeCloseTo(12.5);
    expect(out.mem).toBeCloseTo(25); // 250/1000 * 100
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
