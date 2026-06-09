import {describe, it, expect, beforeAll, afterAll} from 'vitest';
import {prisma} from '@/lib/db/prisma';
import {listServers} from './query';
import {serverListParamsSchema} from '@/lib/validation/server';

const ids: string[] = [];

beforeAll(async () => {
  for (const [name, tag] of [['q-alpha', 'eu'], ['q-bravo', 'us'], ['q-charlie', 'eu']] as const) {
    const s = await prisma.server.create({data: {name, tag, baseUrl: 'http://h:1', apiSkEnc: 'enc'}});
    ids.push(s.id);
  }
  await prisma.serverStatus.create({data: {serverId: ids[0], online: true, cpu: 5, mem: 10}});
});

afterAll(async () => {
  await prisma.serverStatus.deleteMany({where: {serverId: {in: ids}}});
  await prisma.server.deleteMany({where: {id: {in: ids}}});
});

describe('listServers', () => {
  it('filters by search term and never leaks apiSkEnc', async () => {
    const {rows, total} = await listServers(serverListParamsSchema.parse({q: 'q-alpha'}));
    expect(total).toBe(1);
    expect(rows[0].name).toBe('q-alpha');
    expect((rows[0] as unknown as Record<string, unknown>).apiSkEnc).toBeUndefined();
  });

  it('filters by tag and paginates', async () => {
    const {rows, total} = await listServers(serverListParamsSchema.parse({tag: 'eu', pageSize: '5', page: '1'}));
    expect(total).toBe(2);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  it('filters by status=unknown (servers without a status row)', async () => {
    const {rows} = await listServers(serverListParamsSchema.parse({status: 'unknown', tag: 'eu'}));
    expect(rows.every((r) => r.online === null)).toBe(true);
  });

  it('filters by status=online', async () => {
    const {rows} = await listServers(serverListParamsSchema.parse({status: 'online', q: 'q-alpha'}));
    expect(rows).toHaveLength(1);
    expect(rows[0].online).toBe(true);
  });
});
