import {describe, it, expect, vi, beforeEach, afterAll} from 'vitest';

// Mock @/auth so next-auth doesn't try to import 'next/server' in vitest.
vi.mock('@/auth', () => ({auth: vi.fn(async () => null)}));

// Mock auth guards so we control the acting user/role.
const guard = vi.hoisted(() => ({user: {id: '', email: 'a@b.c', role: 'admin' as 'admin' | 'viewer'}}));
vi.mock('@/lib/auth/guards', async (orig) => {
  const actual = await orig<typeof import('@/lib/auth/guards')>();
  return {
    ...actual,
    requireUser: vi.fn(async () => guard.user),
    requireAdmin: vi.fn(async () => {
      if (guard.user.role !== 'admin') throw new actual.AuthError('forbidden');
      return guard.user;
    }),
  };
});
// Mock the panel client so no network is hit.
vi.mock('@/lib/aapanel', async (orig) => {
  const actual = await orig<typeof import('@/lib/aapanel')>();
  return {
    ...actual,
    createClientForServer: vi.fn(() => ({
      collectStatus: async () => ({online: true, cpu: 7, mem: 8, disk: 9}),
      getSystemTotal: async () => ({online: true, cpu: 7, mem: 8}),
    })),
  };
});
// Next cache no-op
vi.mock('next/cache', () => ({revalidatePath: vi.fn()}));

import {prisma} from '@/lib/db/prisma';
import {decryptSecret} from '@/lib/crypto/secret-box';
import {createServerAction, deleteServerAction, refreshServerStatusAction} from './servers';

const KEY = 'a'.repeat(64);
const cleanupServerIds: string[] = [];
const cleanupAuditIds: string[] = [];
let userId = '';
const uniq = () => Math.random().toString(36).slice(2, 8);

beforeEach(async () => {
  process.env.APP_ENCRYPTION_KEY = KEY;
  guard.user.role = 'admin';
  if (!userId) {
    const u = await prisma.user.create({data: {email: `actor-${uniq()}@t.c`, passwordHash: 'x', role: 'admin'}});
    userId = u.id; guard.user.id = u.id;
  }
});

afterAll(async () => {
  if (cleanupAuditIds.length) await prisma.auditLog.deleteMany({where: {id: {in: cleanupAuditIds}}});
  await prisma.server.deleteMany({where: {id: {in: cleanupServerIds}}});
  if (userId) await prisma.user.delete({where: {id: userId}}).catch(() => {});
});

function fd(obj: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(obj)) f.append(k, v);
  return f;
}

describe('createServerAction', () => {
  it('stores the api_sk encrypted (round-trips) and returns ok', async () => {
    const name = `Act-${uniq()}`;
    const state = await createServerAction({ok: false, error: ''}, fd({
      name, baseUrl: 'https://1.2.3.4:8888', apiSk: 'k'.repeat(16), insecureTLS: 'true',
    }));
    expect(state.ok).toBe(true);
    const row = await prisma.server.findFirstOrThrow({where: {name}});
    cleanupServerIds.push(row.id);
    expect(row.apiSkEnc).not.toContain('k'.repeat(16));
    expect(decryptSecret(row.apiSkEnc, KEY)).toBe('k'.repeat(16));
  });

  it('returns field errors on invalid input', async () => {
    const state = await createServerAction({ok: false, error: ''}, fd({name: '', baseUrl: 'nope', apiSk: 'x'}));
    expect(state.ok).toBe(false);
    if (!state.ok) expect(state.fieldErrors?.baseUrl).toBeTruthy();
  });

  it('forbids a viewer from creating', async () => {
    guard.user.role = 'viewer';
    const state = await createServerAction({ok: false, error: ''}, fd({
      name: `Nope-${uniq()}`, baseUrl: 'https://h:1', apiSk: 'k'.repeat(16),
    }));
    expect(state.ok).toBe(false);
  });
});

describe('refreshServerStatusAction', () => {
  it('upserts a ServerStatus from the panel client', async () => {
    const s = await prisma.server.create({data: {name: `Ref-${uniq()}`, baseUrl: 'http://h:1', apiSkEnc: 'enc'}});
    cleanupServerIds.push(s.id);
    const res = await refreshServerStatusAction(s.id);
    expect(res.ok).toBe(true);
    const st = await prisma.serverStatus.findUniqueOrThrow({where: {serverId: s.id}});
    expect(st.online).toBe(true);
    expect(st.cpu).toBe(7);
  });
});

describe('deleteServerAction', () => {
  it('deletes a server (cascades status) and records the deletion in the audit log', async () => {
    const s = await prisma.server.create({data: {name: `Del-${uniq()}`, baseUrl: 'http://h:1', apiSkEnc: 'enc'}});
    const res = await deleteServerAction(fd({id: s.id}));
    expect(res.ok).toBe(true);
    expect(await prisma.server.findUnique({where: {id: s.id}})).toBeNull();
    // The deletion MUST be audited even though the server FK is gone (id lives in target).
    const audit = await prisma.auditLog.findFirst({where: {action: 'server.delete', target: {contains: s.id}}});
    expect(audit).not.toBeNull();
    if (audit) cleanupAuditIds.push(audit.id);
  });
});
