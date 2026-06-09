'use server';
import {revalidatePath} from 'next/cache';
import {requireUser, requireAdmin, AuthError} from '@/lib/auth/guards';
import type {SessionUser} from '@/lib/auth/guards';
import {encryptSecret} from '@/lib/crypto/secret-box';
import {getEncryptionKey} from '@/lib/config/secrets';
import {createClientForServer, AaPanelError} from '@/lib/aapanel';
import {recordAudit} from '@/lib/audit';
import {mapLimit} from '@/lib/utils/concurrency';
import {prisma} from '@/lib/db/prisma';
import {log} from '@/log';
import {serverCreateSchema, serverUpdateSchema, testConnectionSchema} from '@/lib/validation/server';

export type ActionState =
  | {ok: true; message?: string}
  | {ok: false; error: string; fieldErrors?: Record<string, string[]>};

export interface SimpleResult {
  ok: boolean;
  message: string;
}

function fieldErrorState(error: string, fieldErrors?: Record<string, string[]>): ActionState {
  return {ok: false, error, fieldErrors};
}

function describeError(err: unknown): string {
  if (err instanceof AaPanelError) return `${err.kind}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

export async function createServerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user: SessionUser;
  try {
    user = await requireAdmin();
  } catch (e) {
    return fieldErrorState(e instanceof AuthError ? e.code : 'forbidden');
  }
  const parsed = serverCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorState('validation', parsed.error.flatten().fieldErrors as Record<string, string[]>);

  const {name, baseUrl, apiSk, tag, insecureTLS} = parsed.data;
  try {
    const apiSkEnc = encryptSecret(apiSk, getEncryptionKey());
    const server = await prisma.server.create({data: {name, baseUrl, apiSkEnc, tag, insecureTLS}});
    await recordAudit({userId: user.id, serverId: server.id, action: 'server.create', target: name, result: 'ok'});
    revalidatePath('/servers');
    return {ok: true, message: 'created'};
  } catch (err) {
    log.error({err}, 'createServerAction failed');
    await recordAudit({userId: user.id, action: 'server.create', target: name, result: 'error'});
    return fieldErrorState(describeError(err));
  }
}

export async function updateServerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let user: SessionUser;
  try {
    user = await requireAdmin();
  } catch (e) {
    return fieldErrorState(e instanceof AuthError ? e.code : 'forbidden');
  }
  const parsed = serverUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fieldErrorState('validation', parsed.error.flatten().fieldErrors as Record<string, string[]>);

  const {id, name, baseUrl, apiSk, tag, insecureTLS} = parsed.data;
  try {
    const data: Record<string, unknown> = {name, baseUrl, tag, insecureTLS};
    if (apiSk) data.apiSkEnc = encryptSecret(apiSk, getEncryptionKey()); // blank = keep existing
    await prisma.server.update({where: {id}, data});
    await recordAudit({userId: user.id, serverId: id, action: 'server.update', target: name, result: 'ok'});
    revalidatePath('/servers');
    return {ok: true, message: 'updated'};
  } catch (err) {
    log.error({err, id}, 'updateServerAction failed');
    await recordAudit({userId: user.id, serverId: id, action: 'server.update', target: name, result: 'error'});
    return fieldErrorState(describeError(err));
  }
}

export async function deleteServerAction(formData: FormData): Promise<SimpleResult> {
  let user: SessionUser;
  try {
    user = await requireAdmin();
  } catch {
    return {ok: false, message: 'forbidden'};
  }
  const id = String(formData.get('id') ?? '');
  if (!id) return {ok: false, message: 'missing id'};
  try {
    const server = await prisma.server.delete({where: {id}}); // ServerStatus cascades
    // Audit WITHOUT serverId: the row is already gone, so an FK reference would
    // fail the insert (best-effort audit would then silently drop the delete
    // record). Identity is preserved in `target` instead.
    await recordAudit({
      userId: user.id,
      action: 'server.delete',
      target: `${server.name} (${id})`,
      result: 'ok',
    });
    revalidatePath('/servers');
    return {ok: true, message: 'deleted'};
  } catch (err) {
    log.error({err, id}, 'deleteServerAction failed');
    await recordAudit({userId: user.id, action: 'server.delete', target: id, result: 'error'});
    return {ok: false, message: describeError(err)};
  }
}

/** Tests connectivity for a (possibly unsaved) server. Read-only on the panel. */
export async function testConnectionAction(formData: FormData): Promise<SimpleResult> {
  try {
    await requireAdmin();
  } catch {
    return {ok: false, message: 'forbidden'};
  }
  const parsed = testConnectionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return {ok: false, message: 'validation'};
  const {id, baseUrl, apiSk, insecureTLS} = parsed.data;

  try {
    let apiSkEnc: string;
    if (apiSk) {
      apiSkEnc = encryptSecret(apiSk, getEncryptionKey());
    } else if (id) {
      const existing = await prisma.server.findUniqueOrThrow({where: {id}, select: {apiSkEnc: true}});
      apiSkEnc = existing.apiSkEnc;
    } else {
      return {ok: false, message: 'api_sk required'};
    }

    const client = createClientForServer({baseUrl, apiSkEnc, insecureTLS});
    const total = await client.getSystemTotal();
    return {ok: true, message: `online · cpu ${total.cpu ?? '?'}% · mem ${Math.round(total.mem ?? 0)}%`};
  } catch (err) {
    return {ok: false, message: describeError(err)};
  }
}

async function pollAndUpsert(serverId: string): Promise<void> {
  const server = await prisma.server.findUniqueOrThrow({
    where: {id: serverId},
    select: {baseUrl: true, apiSkEnc: true, insecureTLS: true},
  });
  try {
    const total = await createClientForServer(server).getSystemTotal();
    await prisma.serverStatus.upsert({
      where: {serverId},
      create: {serverId, online: true, cpu: total.cpu, mem: total.mem, error: null, lastCheckedAt: new Date()},
      update: {online: true, cpu: total.cpu, mem: total.mem, error: null, lastCheckedAt: new Date()},
    });
  } catch (err) {
    const message = describeError(err);
    await prisma.serverStatus.upsert({
      where: {serverId},
      create: {serverId, online: false, error: message, lastCheckedAt: new Date()},
      update: {online: false, error: message, lastCheckedAt: new Date()},
    });
    throw err;
  }
}

/** Live-polls one server and writes its status to the cache. */
export async function refreshServerStatusAction(serverId: string): Promise<SimpleResult> {
  let user: SessionUser;
  try {
    user = await requireUser();
  } catch {
    return {ok: false, message: 'unauthenticated'};
  }
  if (!serverId) return {ok: false, message: 'missing id'};
  try {
    await pollAndUpsert(serverId);
    await recordAudit({userId: user.id, serverId, action: 'server.refresh', result: 'ok'});
    revalidatePath('/servers');
    return {ok: true, message: 'refreshed'};
  } catch (err) {
    await recordAudit({userId: user.id, serverId, action: 'server.refresh', result: 'error'});
    revalidatePath('/servers');
    return {ok: false, message: describeError(err)};
  }
}

/** Live-polls the visible page of servers (bounded concurrency) — the "live visible page" hybrid. */
export async function refreshVisibleStatusesAction(
  serverIds: string[],
): Promise<{ok: boolean; refreshed: number; failed: number}> {
  try {
    await requireUser();
  } catch {
    return {ok: false, refreshed: 0, failed: serverIds.length};
  }
  const ids = serverIds.filter((id) => typeof id === 'string' && id.length > 0).slice(0, 100);
  const results = await mapLimit(ids, 8, (id) => pollAndUpsert(id));
  const refreshed = results.filter((r) => r.ok).length;
  revalidatePath('/servers');
  return {ok: true, refreshed, failed: results.length - refreshed};
}
