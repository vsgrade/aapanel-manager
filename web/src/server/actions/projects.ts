'use server';
import {revalidatePath} from 'next/cache';
import {requireUser, requireAdmin, AuthError} from '@/lib/auth/guards';
import {createClientForServer, AaPanelError} from '@/lib/aapanel';
import type {ServerMetrics, NodeProject, ProjectOperation} from '@/lib/aapanel';
import {recordAudit} from '@/lib/audit';
import {prisma} from '@/lib/db/prisma';
import {log} from '@/log';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type MetricsResult = {ok: true; metrics: ServerMetrics} | {ok: false; message: string};
export type ProjectsResult = {ok: true; projects: NodeProject[]} | {ok: false; message: string};
export type ControlResult = {ok: boolean; message: string};
export type LogsResult = {ok: true; logs: string} | {ok: false; message: string};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function loadServerCreds(id: string) {
  return prisma.server.findUniqueOrThrow({
    where: {id},
    select: {baseUrl: true, apiSkEnc: true, insecureTLS: true},
  });
}

function describeError(err: unknown): string {
  if (err instanceof AaPanelError) return `${err.kind}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** Returns rich server metrics. Requires authenticated user (any role). */
export async function getServerMetricsAction(serverId: string): Promise<MetricsResult> {
  try {
    await requireUser();
  } catch {
    return {ok: false, message: 'unauthenticated'};
  }
  try {
    const creds = await loadServerCreds(serverId);
    const client = createClientForServer(creds);
    const metrics = await client.getMetrics();
    return {ok: true, metrics};
  } catch (err) {
    log.error({err, serverId}, 'getServerMetricsAction failed');
    return {ok: false, message: describeError(err)};
  }
}

/** Lists Node.js projects on the server. Requires authenticated user (any role). */
export async function listNodeProjectsAction(serverId: string): Promise<ProjectsResult> {
  try {
    await requireUser();
  } catch {
    return {ok: false, message: 'unauthenticated'};
  }
  try {
    const creds = await loadServerCreds(serverId);
    const client = createClientForServer(creds);
    const projects = await client.listProjects();
    return {ok: true, projects};
  } catch (err) {
    log.error({err, serverId}, 'listNodeProjectsAction failed');
    return {ok: false, message: describeError(err)};
  }
}

const VALID_OPS: ReadonlySet<string> = new Set(['start', 'stop', 'restart']);

/** Start / stop / restart a Node.js project. Requires admin role. Records audit on both paths. */
export async function projectControlAction(
  serverId: string,
  projectName: string,
  op: ProjectOperation,
): Promise<ControlResult> {
  let userId: string;
  try {
    const user = await requireAdmin();
    userId = user.id;
  } catch (e) {
    return {ok: false, message: e instanceof AuthError ? e.code : 'forbidden'};
  }

  if (!VALID_OPS.has(op)) return {ok: false, message: 'invalid'};
  if (!projectName) return {ok: false, message: 'invalid'};

  try {
    const creds = await loadServerCreds(serverId);
    const client = createClientForServer(creds);
    const result = await client.batchOperation([projectName], op);
    // The panel can return HTTP 200 while the per-project operation failed
    // (msg_list[i].status === false). Surface that as a failure, not success.
    const item = result.msg_list?.[0];
    if (item && item.status === false) {
      await recordAudit({userId, serverId, action: `project.${op}`, target: projectName, result: 'error'});
      return {ok: false, message: item.msg || op};
    }
    await recordAudit({
      userId,
      serverId,
      action: `project.${op}`,
      target: projectName,
      result: 'ok',
    });
    revalidatePath(`/servers/${serverId}/projects`);
    return {ok: true, message: op};
  } catch (err) {
    log.error({err, serverId, projectName, op}, 'projectControlAction failed');
    await recordAudit({
      userId,
      serverId,
      action: `project.${op}`,
      target: projectName,
      result: 'error',
    });
    return {ok: false, message: describeError(err)};
  }
}

/** Fetches the most recent log output for a project. Requires authenticated user (any role). */
export async function getProjectLogsAction(serverId: string, projectName: string): Promise<LogsResult> {
  try {
    await requireUser();
  } catch {
    return {ok: false, message: 'unauthenticated'};
  }
  try {
    const creds = await loadServerCreds(serverId);
    const client = createClientForServer(creds);
    const logs = await client.getProjectLogs(projectName);
    return {ok: true, logs};
  } catch (err) {
    log.error({err, serverId, projectName}, 'getProjectLogsAction failed');
    return {ok: false, message: describeError(err)};
  }
}
