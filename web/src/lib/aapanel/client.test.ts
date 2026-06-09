import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {AaPanelClient} from './client';
import {AaPanelError, type NodeProject} from './types';

// ---------------------------------------------------------------------------
// Mock undici so tests never touch the network.
// Keep the real Agent (spread `actual`) so `new Agent(...)` works in client.ts.
// Replace only `fetch` with a vi.fn() that tests control per-call.
// ---------------------------------------------------------------------------
vi.mock('undici', async (orig) => {
  const actual = await orig<typeof import('undici')>();
  return {...actual, fetch: vi.fn()};
});

// Import the mocked fetch AFTER vi.mock is hoisted.
import {fetch as undiciFetch} from 'undici';
const fetchMock = vi.mocked(undiciFetch);

const cfg = {baseUrl: 'https://panel.example:8888', apiSk: 'k', insecureTLS: true, timeoutMs: 1000};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {status, headers: {'content-type': 'application/json'}});
}

// ---------------------------------------------------------------------------
// Real aaPanel fixture data (confirmed against live panel — see bug report).
// ---------------------------------------------------------------------------

/** Real GetSystemTotal response (no `load` field). */
const FIXTURE_SYSTEM_TOTAL = {
  memTotal: 3819,
  memFree: 374,
  memBuffers: 282,
  memCached: 2700,
  memRealUsed: 463,
  cpuNum: 2,
  cpuRealUsed: 0.5,
  time: '3 Day(s)',
  system: 'Ubuntu 24.04.3 LTS x86_64(Py3.12.3)',
  version: '8.0.1',
};

/** Real GetDiskInfo response — size[3] = "24%". */
const FIXTURE_DISK_INFO = [
  {
    filesystem: '/dev/mapper/ubuntu--vg-ubuntu--lv',
    type: 'ext4',
    path: '/',
    size: ['128G', '30G', '94G', '24%'],
    inodes: ['8519680', '564220', '7955460', '7%'],
  },
];

/**
 * Real GetNetWork response — `load` is an OBJECT {one,five,fifteen,...},
 * NOT an array; up/down are top-level KB/s numbers.
 */
const FIXTURE_NETWORK = {
  up: 0.03,
  down: 0.59,
  upTotal: 50025119,
  downTotal: 457790673,
  load: {one: 0.117, five: 0.078, fifteen: 0.013, max: 4, limit: 4, safe: 3.0},
  cpu: [0.5, 0.0],
  mem: {memTotal: 3819, memFree: 374, memRealUsed: 463, memCached: 2700},
  disk: [],
};

// ---------------------------------------------------------------------------
// AaPanelClient.getSystemTotal
// ---------------------------------------------------------------------------

describe('AaPanelClient.getSystemTotal', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('maps a real fixture to normalized metrics', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE_SYSTEM_TOTAL) as never);
    const client = new AaPanelClient(cfg);
    const out = await client.getSystemTotal();

    expect(out.online).toBe(true);
    expect(out.cpu).toBeCloseTo(0.5);
    // memPercent = 463/3819 * 100 ≈ 12.1
    expect(out.mem).toBeCloseTo((463 / 3819) * 100);

    // Verify signed body was sent
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('request_time=');
    expect(body).toContain('request_token=');
  });

  it('classifies HTTP 401 as an auth error', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({msg: 'bad key'}, 401) as never);
    const client = new AaPanelClient(cfg);
    await expect(client.getSystemTotal()).rejects.toMatchObject({kind: 'auth'} satisfies Partial<AaPanelError>);
  });

  it('classifies a thrown TypeError as a network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('connect ECONNREFUSED') as never);
    const client = new AaPanelClient(cfg);
    await expect(client.getSystemTotal()).rejects.toMatchObject({kind: 'network'});
  });

  it('includes the cause code in the network error message', async () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: {code: 'UND_ERR_INVALID_ARG'},
    });
    fetchMock.mockRejectedValueOnce(err as never);
    const client = new AaPanelClient(cfg);
    await expect(client.getSystemTotal()).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('UND_ERR_INVALID_ARG'),
    });
  });

  it('includes UNABLE_TO_VERIFY_LEAF_SIGNATURE in the message when relevant', async () => {
    const err = Object.assign(new TypeError('fetch failed'), {
      cause: {code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'},
    });
    fetchMock.mockRejectedValueOnce(err as never);
    const client = new AaPanelClient(cfg);
    await expect(client.getSystemTotal()).rejects.toMatchObject({
      kind: 'network',
      message: 'fetch failed (UNABLE_TO_VERIFY_LEAF_SIGNATURE)',
    });
  });

  it('classifies an AbortError as a timeout', async () => {
    const err = Object.assign(new Error('aborted'), {name: 'AbortError'});
    fetchMock.mockRejectedValueOnce(err as never);
    const client = new AaPanelClient(cfg);
    await expect(client.getSystemTotal()).rejects.toMatchObject({kind: 'timeout'});
  });
});

// ---------------------------------------------------------------------------
// AaPanelClient.getDiskInfo
// ---------------------------------------------------------------------------

describe('AaPanelClient.getDiskInfo', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('returns the root mount usage percent from real fixture', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE_DISK_INFO) as never);
    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    expect(await client.getDiskInfo()).toBeCloseTo(24);
  });

  it('returns null when no parsable mount is present', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([]) as never);
    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    expect(await client.getDiskInfo()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AaPanelClient.collectStatus
// ---------------------------------------------------------------------------

describe('AaPanelClient.collectStatus', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('combines system + disk; disk failure does not fail the snapshot', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE_SYSTEM_TOTAL) as never);
    fetchMock.mockRejectedValueOnce(new TypeError('disk fetch failed') as never);

    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    const snap = await client.collectStatus();

    expect(snap.online).toBe(true);
    expect(snap.cpu).toBeCloseTo(0.5);
    expect(snap.mem).toBeCloseTo((463 / 3819) * 100);
    expect(snap.disk).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// AaPanelClient.getMetrics — uses REAL fixture shapes
// Call order: 1=GetSystemTotal, 2=GetDiskInfo, 3=GetNetWork
// ---------------------------------------------------------------------------

describe('AaPanelClient.getMetrics', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('maps a full happy-path response to ServerMetrics using real fixtures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE_SYSTEM_TOTAL) as never);
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE_DISK_INFO) as never);
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE_NETWORK) as never);

    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    const metrics = await client.getMetrics();

    expect(metrics.cpuPercent).toBeCloseTo(0.5);
    expect(metrics.cores).toBe(2);
    expect(metrics.memTotalMb).toBe(3819);
    expect(metrics.memUsedMb).toBe(463);
    expect(metrics.memPercent).toBeCloseTo((463 / 3819) * 100); // ≈ 12.1
    expect(metrics.diskPercent).toBeCloseTo(24);
    // load is an object from GetNetWork — NOT an array
    expect(metrics.load).toEqual({one: 0.117, five: 0.078, fifteen: 0.013});
    // up/down are top-level KB/s numbers
    expect(metrics.netUpKbps).toBeCloseTo(0.03);
    expect(metrics.netDownKbps).toBeCloseTo(0.59);
  });

  it('resolves with null network fields when GetNetWork rejects (best-effort)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE_SYSTEM_TOTAL) as never);
    fetchMock.mockResolvedValueOnce(jsonResponse(FIXTURE_DISK_INFO) as never);
    fetchMock.mockRejectedValueOnce(new TypeError('network fetch failed') as never);

    const client = new AaPanelClient({baseUrl: 'https://h:8888', apiSk: 'k', insecureTLS: true});
    const metrics = await client.getMetrics();

    expect(metrics.cpuPercent).toBeCloseTo(0.5);
    expect(metrics.memPercent).toBeCloseTo((463 / 3819) * 100);
    expect(metrics.diskPercent).toBeCloseTo(24);
    // Network becomes null on failure
    expect(metrics.netUpKbps).toBeNull();
    expect(metrics.netDownKbps).toBeNull();
    expect(metrics.load).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Node.js project methods
// Real response shapes documented in docs/en/nodejs-projects.md (live v8 panel).
// ---------------------------------------------------------------------------

// Fixture: two projects (one running, one stopped) matching the real panel shape.
const projectListResponse = {
  status: 0,
  message: {
    page: "<div><span class='Pcurrent'>1</span><span class='Pcount'>Total 2</span></div>",
    shift: '0',
    row: '10',
    data: [
      {
        id: 4,
        name: 'myapp',
        path: '/www/node-projects/myapp/',
        status: '1',
        ps: 'myapp 3003',
        addtime: '2026-02-03 03:22:24',
        project_type: 'Node',
        project_config: {
          project_name: 'myapp',
          project_cwd: '/www/node-projects/myapp/',
          project_script: 'prod:start',
          bind_extranet: 1,
          domains: ['myapp.example.com:80'],
          is_power_on: 0,
          run_user: 'www',
          max_memory_limit: 4096,
          nodejs_version: 'v24.13.0',
          port: 3003,
          log_path: '/www/wwwlogs/nodejs',
        },
        load_info: {
          '1162208': {
            name: 'MainThread',
            pid: 1162208,
            status: 'Sleeping',
            user: 'www',
            memory_used: 208945152,
            cpu_percent: 0.09,
            threads: 18,
            exe: 'node server.js',
          },
        },
        run: true,
        listen: [3003],
        listen_ok: true,
      },
      {
        id: 5,
        name: 'stoppedapp',
        path: '/www/node-projects/stoppedapp/',
        status: '0',
        ps: 'stoppedapp 3004',
        addtime: '2026-03-01 10:00:00',
        project_type: 'Node',
        project_config: {
          project_name: 'stoppedapp',
          project_cwd: '/www/node-projects/stoppedapp/',
          project_script: 'start',
          bind_extranet: 0,
          domains: [],
          is_power_on: 0,
          run_user: 'www',
          max_memory_limit: 2048,
          nodejs_version: 'v24.13.0',
          port: 3004,
          log_path: '/www/wwwlogs/nodejs',
        },
        load_info: {},
        run: false,
        listen: [],
        listen_ok: false,
      },
    ],
  },
};

describe('AaPanelClient.listProjects', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('returns a NodeProject[] with mapped name, status, port, path, cpu, mem', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(projectListResponse) as never);
    const client = new AaPanelClient(cfg);
    const projects: NodeProject[] = await client.listProjects();

    // Correct count
    expect(projects).toHaveLength(2);

    // Running project
    const running = projects[0];
    expect(running.name).toBe('myapp');
    expect(running.status).toBe('running');
    expect(running.port).toBe(3003);
    expect(running.path).toBe('/www/node-projects/myapp/');
    // cpu_percent from load_info (sum across processes): 0.09
    expect(running.cpu).toBeCloseTo(0.09);
    // memory_used bytes → MB: 208945152 / 1024 / 1024 ≈ 199.25
    expect(running.mem).toBeCloseTo(208945152 / 1024 / 1024);

    // Stopped project: load_info is empty → cpu/mem null
    const stopped = projects[1];
    expect(stopped.name).toBe('stoppedapp');
    expect(stopped.status).toBe('stopped');
    expect(stopped.port).toBe(3004);
    expect(stopped.cpu).toBeNull();
    expect(stopped.mem).toBeNull();

    // URL must contain the Node endpoint path
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/v2/project/nodejs/get_project_list');

    // Body must use the data= wrapper
    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('data=');
    expect(body).toContain('request_time=');
    expect(body).toContain('request_token=');
  });

  it('status "running" when run=true, "stopped" when run=false', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(projectListResponse) as never);
    const client = new AaPanelClient(cfg);
    const projects = await client.listProjects();
    expect(projects[0].status).toBe('running');
    expect(projects[1].status).toBe('stopped');
  });
});

describe('AaPanelClient.batchOperation', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('POSTs a flat body with project_names JSON array and operation_type', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 0,
        message: {
          msg: 'Successfully 1 items.Failed on 0 projects.',
          msg_list: [{name: 'myapp', status: true, msg: 'Started successfully'}],
        },
      }) as never,
    );
    const client = new AaPanelClient(cfg);
    await client.batchOperation(['myapp'], 'start');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/v2/project/nodejs/batch_operation_project');

    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    // Must contain project_names= with the JSON array (URL-encoded)
    expect(body).toContain('project_names=');
    expect(decodeURIComponent(body)).toContain('["myapp"]');
    // Must contain operation_type=start
    expect(body).toContain('operation_type=start');
    // Must NOT use the data= wrapper (flat body)
    expect(body).not.toContain('data=');
  });

  it('encodes multiple project names correctly', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 0,
        message: {msg: 'Successfully 2 items.Failed on 0 projects.', msg_list: []},
      }) as never,
    );
    const client = new AaPanelClient(cfg);
    await client.batchOperation(['app1', 'app2'], 'stop');

    const body = decodeURIComponent(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toContain('["app1","app2"]');
    expect(body).toContain('operation_type=stop');
  });
});

describe('AaPanelClient.getProjectInfo', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('returns a NodeProject for a single project', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 0,
        message: {
          id: 3,
          name: 'myapp',
          path: '/www/node-projects/myapp/',
          project_type: 'Node',
          project_config: {
            project_name: 'myapp',
            project_cwd: '/www/node-projects/myapp/',
            project_script: 'start',
            port: 3002,
            run_user: 'www',
            nodejs_version: 'v24.13.0',
            is_power_on: 1,
            domains: ['myapp.example.com:80'],
            max_memory_limit: 4096,
          },
          load_info: {},
          run: false,
          listen: [],
          listen_ok: true,
        },
      }) as never,
    );
    const client = new AaPanelClient(cfg);
    const project: NodeProject = await client.getProjectInfo('myapp');
    expect(project.name).toBe('myapp');
    expect(project.status).toBe('stopped');
    expect(project.port).toBe(3002);
    expect(project.path).toBe('/www/node-projects/myapp/');
    expect(project.cpu).toBeNull();
    expect(project.mem).toBeNull();
  });
});

describe('AaPanelClient.getProjectLogs', () => {
  beforeEach(() => fetchMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('returns the log text from message.result', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: 0,
        message: {result: 'PM2 log output here\nline2'},
      }) as never,
    );
    const client = new AaPanelClient(cfg);
    const log = await client.getProjectLogs('myapp');
    expect(typeof log).toBe('string');
    expect(log).toContain('PM2 log output here');

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/v2/project/nodejs/get_project_log');

    const body = String((fetchMock.mock.calls[0][1] as RequestInit).body);
    expect(body).toContain('data=');
  });
});
