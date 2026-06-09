import {describe, it, expect, afterAll} from 'vitest';
import {prisma} from '@/lib/db/prisma';
import {recordAudit} from './audit';

const createdIds: string[] = [];

afterAll(async () => {
  if (createdIds.length) await prisma.auditLog.deleteMany({where: {id: {in: createdIds}}});
});

describe('recordAudit', () => {
  it('persists an audit row and returns it', async () => {
    const row = await recordAudit({action: 'server.test', result: 'ok', target: 'unit'});
    expect(row).not.toBeNull();
    if (row) {
      createdIds.push(row.id);
      expect(row.action).toBe('server.test');
      expect(row.result).toBe('ok');
    }
  });

  it('never throws even if the write fails (returns null on FK violation)', async () => {
    await expect(
      recordAudit({action: 'x', result: 'ok', userId: 'definitely-missing-user-id'}),
    ).resolves.toBeNull();
  });
});
