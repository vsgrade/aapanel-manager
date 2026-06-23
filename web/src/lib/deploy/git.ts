import 'server-only';
import {spawn, execFile} from 'node:child_process';
import {openSync, closeSync, writeFileSync, readFileSync, rmSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Git update strategy: the panel updates ITSELF in place — `git fetch` + checkout
 * the target tag, `pnpm install`, `prisma migrate deploy`, `pnpm build`, then
 * restart its own Node project via the aaPanel API. The heavy work runs in a
 * DETACHED process ({@link launchGitUpdate}) so it survives the restart it
 * triggers, and a single-flight lock prevents two updates of the same instance.
 */

/** A crashed update leaves a lock behind — ignore it after this many ms. */
export const UPDATE_LOCK_TTL_MS = 30 * 60_000;

export interface UpdatePaths {
  /** Single-flight lock for this instance. */
  lock: string;
  /** Append-only log of the detached updater (where the admin reads failures). */
  log: string;
  /** Pre-update pg_dump backups. */
  backupsDir: string;
}

/** Pure: artefact paths derived from the git repo root. */
export function updatePaths(repoRoot: string): UpdatePaths {
  return {
    lock: path.join(repoRoot, '.update.lock'),
    log: path.join(repoRoot, '.update.log'),
    backupsDir: path.join(repoRoot, '.update-backups'),
  };
}

export interface LockInfo {
  kind: 'update' | 'rollback';
  target: string;
  startedAt: number;
}

/** Pure: is a lock started at `startedAt` stale (crashed run) at `now`? */
export function isLockStale(startedAt: number, now: number): boolean {
  return !Number.isFinite(startedAt) || now - startedAt > UPDATE_LOCK_TTL_MS;
}

/** Absolute git repo root containing `fromDir`, or null when not a checkout. */
export async function gitRepoRoot(fromDir: string): Promise<string | null> {
  try {
    const {stdout} = await execFileAsync('git', ['-C', fromDir, 'rev-parse', '--show-toplevel']);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Atomically takes the update lock. Returns true on success, false when a fresh
 * (non-stale) lock already exists. A stale lock is replaced.
 */
export function acquireUpdateLock(lockPath: string, info: LockInfo, now: number): boolean {
  try {
    const fd = openSync(lockPath, 'wx'); // O_EXCL: create-if-absent, atomic
    writeFileSync(fd, JSON.stringify(info));
    closeSync(fd);
    return true;
  } catch (err) {
    if ((err as {code?: string}).code !== 'EEXIST') throw err;
    let prev: LockInfo | null = null;
    try {
      prev = JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo;
    } catch {
      prev = null;
    }
    if (prev && !isLockStale(prev.startedAt, now)) return false;
    writeFileSync(lockPath, JSON.stringify(info)); // replace stale/corrupt lock
    return true;
  }
}

/** Removes the lock (best-effort). */
export function releaseUpdateLock(lockPath: string): void {
  try {
    rmSync(lockPath, {force: true});
  } catch {
    /* ignore */
  }
}

/**
 * Spawns the detached git self-update runner. It logs to `<repoRoot>/.update.log`
 * and outlives the panel restart it triggers. `webDir` is the web app directory
 * (the runner's cwd); the runner resolves the repo root itself.
 */
export function launchGitUpdate(opts: {webDir: string; logPath: string; kind: 'update' | 'rollback'; target: string}): void {
  const {webDir, logPath, kind, target} = opts;
  mkdirSync(path.dirname(logPath), {recursive: true});
  const out = openSync(logPath, 'a');
  try {
    const tsxBin = path.join(webDir, 'node_modules', '.bin', 'tsx');
    const child = spawn(
      tsxBin,
      ['--env-file-if-exists=.env', '--tsconfig', 'tsconfig.worker.json', 'scripts/git-self-update.ts', kind, target],
      {cwd: webDir, detached: true, stdio: ['ignore', out, out], env: process.env},
    );
    child.unref();
  } finally {
    closeSync(out);
  }
}
