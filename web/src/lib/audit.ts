import 'server-only';
import type {AuditLog} from '@prisma/client';
import {prisma} from '@/lib/db/prisma';
import {log} from '@/log';

export interface AuditInput {
  action: string;
  result: 'ok' | 'error' | string;
  userId?: string;
  serverId?: string;
  target?: string;
}

/** Best-effort audit write. Returns the row, or null if persistence failed. */
export async function recordAudit(input: AuditInput): Promise<AuditLog | null> {
  try {
    return await prisma.auditLog.create({data: input});
  } catch (err) {
    log.error({err, action: input.action}, 'failed to write audit log');
    return null;
  }
}
