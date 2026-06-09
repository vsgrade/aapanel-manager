import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {AaPanelClient} from './client';
import {AaPanelError, type NodeProject} from './types';

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
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns a NodeProject[] with mapped name, status, port, path, cpu, mem', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(projectListResponse),
    );
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(projectListResponse));
    const client = new AaPanelClient(cfg);
    const projects = await client.listProjects();
    expect(projects[0].status).toBe('running');
    expect(projects[1].status).toBe('stopped');
  });
});

describe('AaPanelClient.batchOperation', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('POSTs a flat body with project_names JSON array and operation_type', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 0,
        message: {
          msg: 'Successfully 1 items.Failed on 0 projects.',
          msg_list: [{name: 'myapp', status: true, msg: 'Started successfully'}],
        },
      }),
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
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({status: 0, message: {msg: 'Successfully 2 items.Failed on 0 projects.', msg_list: []}}),
    );
    const client = new AaPanelClient(cfg);
    await client.batchOperation(['app1', 'app2'], 'stop');

    const body = decodeURIComponent(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toContain('["app1","app2"]');
    expect(body).toContain('operation_type=stop');
  });
});

describe('AaPanelClient.getProjectInfo', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns a NodeProject for a single project', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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
      }),
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
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('returns the log text from message.result', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        status: 0,
        message: {result: 'PM2 log output here\nline2'},
      }),
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
