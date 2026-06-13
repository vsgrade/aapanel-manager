import {describe, it, expect, vi, beforeEach} from 'vitest';

vi.mock('@/auth', () => ({auth: vi.fn(async () => null)}));

const guard = vi.hoisted(() => ({role: 'admin' as 'admin' | 'viewer'}));
vi.mock('@/lib/auth/guards', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/guards')>();
  return {
    ...actual,
    requireAdmin: vi.fn(async () => {
      if (guard.role !== 'admin') throw new actual.AuthError('forbidden');
      return {id: 'u1', email: 'a@b.c', role: 'admin' as const};
    }),
  };
});

vi.mock('next/cache', () => ({revalidatePath: vi.fn()}));
vi.mock('@/lib/audit', () => ({recordAudit: vi.fn(async () => null)}));
vi.mock('@/lib/version/current', () => ({
  getCurrentVersion: () => ({version: '1.0.0', commit: null, buildTime: null}),
}));

const settingsMock = vi.hoisted(() => ({
  getUpdateSettings: vi.fn(),
  saveUpdateSettings: vi.fn(async () => undefined),
  getGithubConfig: vi.fn(async () => ({owner: 'acme', repo: 'panel', token: null})),
  getVersionHistory: vi.fn(async () => [] as {version: string; installedAt: Date}[]),
  recordVersionIfNew: vi.fn(async () => undefined),
}));
vi.mock('@/lib/version/settings', () => settingsMock);

const githubMock = vi.hoisted(() => ({fetchReleases: vi.fn()}));
vi.mock('@/lib/version/github', async (orig) => {
  const actual = await orig<typeof import('@/lib/version/github')>();
  return {...actual, fetchReleases: githubMock.fetchReleases};
});

vi.mock('@/lib/servers/query', () => ({
  listServerOptions: vi.fn(async () => [{id: 's1', name: 'srv', tag: null}]),
}));

import {getUpdateStatusAction, getUpdateSettingsAction, saveUpdateSettingsAction} from './updates';

const CONFIGURED = {
  deploymentMode: 'docker' as const,
  githubOwner: 'acme',
  githubRepo: 'panel',
  hasToken: false,
  aapanelServerId: null,
  aapanelProject: null,
  startScript: null,
  serviceName: 'app',
};

beforeEach(() => {
  guard.role = 'admin';
  settingsMock.getUpdateSettings.mockResolvedValue(CONFIGURED);
  settingsMock.getVersionHistory.mockResolvedValue([]);
  githubMock.fetchReleases.mockReset();
});

describe('getUpdateStatusAction', () => {
  it('reports not-configured when owner/repo are blank (no GitHub call)', async () => {
    settingsMock.getUpdateSettings.mockResolvedValueOnce({...CONFIGURED, githubOwner: '', githubRepo: ''});
    const res = await getUpdateStatusAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.configured).toBe(false);
      expect(res.latest).toBeNull();
      expect(res.current.version).toBe('1.0.0');
      expect(res.upgradeCommand).toContain('docker compose');
    }
    expect(githubMock.fetchReleases).not.toHaveBeenCalled();
  });

  it('flags an available update when the latest release is newer', async () => {
    githubMock.fetchReleases.mockResolvedValueOnce([
      {version: 'v1.2.0', name: '1.2.0', body: 'notes', prerelease: false, publishedAt: '2026-06-10', htmlUrl: 'u'},
    ]);
    const res = await getUpdateStatusAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.configured).toBe(true);
      expect(res.latest?.version).toBe('v1.2.0');
      expect(res.updateAvailable).toBe(true);
    }
  });

  it('does not flag an update when latest equals current', async () => {
    githubMock.fetchReleases.mockResolvedValueOnce([
      {version: 'v1.0.0', name: '1.0.0', body: '', prerelease: false, publishedAt: null, htmlUrl: 'u'},
    ]);
    const res = await getUpdateStatusAction();
    expect(res.ok && res.updateAvailable).toBe(false);
  });

  it('surfaces a GitHub error without failing, still returning the current version', async () => {
    githubMock.fetchReleases.mockRejectedValueOnce(new Error('rate limited'));
    const res = await getUpdateStatusAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.error).toContain('rate limited');
      expect(res.current.version).toBe('1.0.0');
      expect(res.updateAvailable).toBe(false);
    }
  });

  it('forbids non-admins', async () => {
    guard.role = 'viewer';
    const res = await getUpdateStatusAction();
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.message).toBe('forbidden');
  });
});

describe('getUpdateSettingsAction', () => {
  it('returns settings and the server list', async () => {
    const res = await getUpdateSettingsAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.settings.deploymentMode).toBe('docker');
      expect(res.servers).toHaveLength(1);
    }
  });
});

describe('saveUpdateSettingsAction', () => {
  it('saves valid settings', async () => {
    const fd = new FormData();
    fd.set('deploymentMode', 'docker');
    fd.set('githubOwner', 'acme');
    fd.set('githubRepo', 'panel');
    const res = await saveUpdateSettingsAction(fd);
    expect(res.ok).toBe(true);
    expect(settingsMock.saveUpdateSettings).toHaveBeenCalled();
  });

  it('rejects an unknown deployment mode with a validation error', async () => {
    const fd = new FormData();
    fd.set('deploymentMode', 'k8s');
    const res = await saveUpdateSettingsAction(fd);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('validation');
  });

  it('forbids non-admins', async () => {
    guard.role = 'viewer';
    const fd = new FormData();
    fd.set('deploymentMode', 'docker');
    const res = await saveUpdateSettingsAction(fd);
    expect(res.ok).toBe(false);
  });
});
