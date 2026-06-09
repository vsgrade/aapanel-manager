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

describe('AaPanelClient.getDiskInfo', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns the root mount usage percent', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([
        {path: '/', size: ['100G', '40G', '60G', '40%']},
        {path: '/boot', size: ['1G', '0.5G', '0.5G', '50%']},
      ]), {status: 200, headers: {'content-type': 'application/json'}}),
    );
    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    expect(await client.getDiskInfo()).toBeCloseTo(40);
  });

  it('returns null when no parsable mount is present', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), {status: 200, headers: {'content-type': 'application/json'}}),
    );
    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    expect(await client.getDiskInfo()).toBeNull();
  });
});

describe('AaPanelClient.collectStatus', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('combines system + disk; disk failure does not fail the snapshot', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({cpuRealUsed: 10, memTotal: 100, memRealUsed: 30}), {status: 200, headers: {'content-type': 'application/json'}}),
    );
    fetchMock.mockRejectedValueOnce(new TypeError('disk fetch failed'));
    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    const snap = await client.collectStatus();
    expect(snap).toMatchObject({online: true, cpu: 10, disk: null});
    expect(snap.mem).toBeCloseTo(30);
  });
});

// ---------------------------------------------------------------------------
// GetNetWork response shape (docs/en/system-monitoring.md §GetNetWork):
//   { up: number, down: number, load: [one, five, fifteen], ... }
//   up/down are current speeds in KB/s; load is the system load average array.
// GetSystemTotal response shape (docs/en/system-monitoring.md §GetSystemTotal):
//   { cpuRealUsed, cpuNum, memTotal, memRealUsed, ... }  — no load field here.
// ---------------------------------------------------------------------------

describe('AaPanelClient.getMetrics', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('maps a full happy-path response to ServerMetrics', async () => {
    // Call order: 1=GetSystemTotal, 2=GetDiskInfo, 3=GetNetWork
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        cpuRealUsed: 5.9,
        cpuNum: 6,
        memTotal: 5782,
        memRealUsed: 1125,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {path: '/', size: ['97G', '29G', '64G', '40%']},
      ]),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        up: 128,
        down: 256,
        load: [0.5, 0.8, 1.2],
      }),
    );

    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    const metrics = await client.getMetrics();

    expect(metrics.cpuPercent).toBeCloseTo(5.9);
    expect(metrics.cores).toBe(6);
    expect(metrics.memUsedMb).toBe(1125);
    expect(metrics.memTotalMb).toBe(5782);
    expect(metrics.memPercent).toBeCloseTo((1125 / 5782) * 100);
    expect(metrics.diskPercent).toBeCloseTo(40);
    expect(metrics.netUpKbps).toBe(128);
    expect(metrics.netDownKbps).toBe(256);
    expect(metrics.load).toEqual({one: 0.5, five: 0.8, fifteen: 1.2});
  });

  it('resolves with null network fields when GetNetWork rejects (best-effort)', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        cpuRealUsed: 10,
        cpuNum: 4,
        memTotal: 1000,
        memRealUsed: 400,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse([{path: '/', size: ['50G', '10G', '40G', '20%']}]),
    );
    fetchMock.mockRejectedValueOnce(new TypeError('network fetch failed'));

    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    const metrics = await client.getMetrics();

    // CPU and mem must still resolve correctly
    expect(metrics.cpuPercent).toBeCloseTo(10);
    expect(metrics.memPercent).toBeCloseTo(40);
    // Network becomes null on failure
    expect(metrics.netUpKbps).toBeNull();
    expect(metrics.netDownKbps).toBeNull();
    // Load also becomes null when GetNetWork fails
    expect(metrics.load).toBeNull();
    // Disk still works
    expect(metrics.diskPercent).toBeCloseTo(20);
  });
});
