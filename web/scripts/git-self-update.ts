// Detached git self-update runner (git deployment mode).
//
// Launched by gitUpdateAction/gitRollbackAction via launchGitUpdate() as a
// DETACHED process so it survives the panel restart it triggers at the end.
// Run with tsx + tsconfig.worker.json (so `@/` paths resolve and `server-only`
// is a no-op outside Next), cwd = the web app dir:
//
//   tsx --env-file-if-exists=.env --tsconfig tsconfig.worker.json \
//       scripts/git-self-update.ts <update|rollback> <X.Y.Z>
//
// Pipeline: backup DB → git fetch → checkout vX.Y.Z → pnpm install →
//           prisma migrate deploy → pnpm build → record history → restart.
// All output is appended to <repoRoot>/.update.log; the single-flight lock at
// <repoRoot>/.update.lock is released in finally. On any failure BEFORE the
// restart, the old version keeps running (we never restart a broken build).

import {execFile} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {gitRepoRoot, updatePaths, releaseUpdateLock} from '@/lib/deploy/git';
import {runDbBackup, PgDumpNotAvailableError} from '@/lib/deploy/db-backup';
import {runMigrations} from '@/lib/deploy/migrate';
import {getSelfRestartConfig, recordActivation} from '@/lib/version/settings';
import {getCurrentVersion} from '@/lib/version/current';
import {createClientForServer} from '@/lib/aapanel';
import {prisma} from '@/lib/db/prisma';

const execFileAsync = promisify(execFile);
const BIG = 64 * 1024 * 1024;

// Package manager is configurable so the button works with whatever is installed
// on the server. Default pnpm (the project's PM); APP_PKG_BIN overrides the path.
const PM = (process.env.APP_PKG_MANAGER || 'pnpm').toLowerCase() === 'npm' ? 'npm' : 'pnpm';
const PM_BIN = process.env.APP_PKG_BIN || PM;
const INSTALL_ARGS = PM === 'npm' ? ['install'] : ['install', '--frozen-lockfile'];

async function main(): Promise<void> {
  const kind = process.argv[2] === 'rollback' ? 'rollback' : 'update';
  const target = (process.argv[3] || '').trim().replace(/^v/, '');
  const webDir = process.cwd();

  const repoRoot = await gitRepoRoot(webDir);
  if (!repoRoot) {
    // Cannot resolve paths/lock without the repo root — fail loudly to stderr.
    console.error('git-self-update: not a git checkout');
    process.exitCode = 1;
    return;
  }
  const paths = updatePaths(repoRoot);
  const log = (msg: string) => {
    appendFileSync(paths.log, `[${new Date().toISOString()}] ${msg}\n`);
  };
  const run = async (file: string, args: string[], cwd: string) => {
    const {stdout, stderr} = await execFileAsync(file, args, {cwd, env: process.env, maxBuffer: BIG});
    const out = `${stdout}${stderr}`.trim();
    if (out) log(out);
  };

  if (!target) {
    log('FAILED: no target version');
    releaseUpdateLock(paths.lock);
    process.exitCode = 1;
    return;
  }

  try {
    log(`=== ${kind} → v${target} (start) ===`);

    const self = await getSelfRestartConfig();
    if (!self) throw new Error('self-restart is not configured');
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is not set');

    const previous = getCurrentVersion().version;
    log(`current version: ${previous}`);

    // 1) DB backup (best-effort: pg_dump may be absent on this host).
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try {
      const backup = await runDbBackup(
        databaseUrl,
        path.join(paths.backupsDir, `pre-${target}-${stamp}.sql`),
        paths.backupsDir,
      );
      log(`db backup: ${backup.path} (${backup.bytes} bytes)`);
    } catch (err) {
      if (err instanceof PgDumpNotAvailableError) log('db backup SKIPPED: pg_dump not available');
      else throw err;
    }

    // 2) Fetch + checkout the target tag.
    log('git fetch --tags');
    await run('git', ['-C', repoRoot, 'fetch', '--tags', '--force'], repoRoot);
    log(`git checkout v${target}`);
    await run('git', ['-C', repoRoot, 'checkout', '-f', `v${target}`], repoRoot);

    // 3) Install deps, migrate, build (in the web app dir).
    log(`${PM_BIN} ${INSTALL_ARGS.join(' ')}`);
    await run(PM_BIN, INSTALL_ARGS, webDir);
    log('prisma migrate deploy');
    log(await runMigrations(webDir, databaseUrl));
    log(`${PM_BIN} run build`);
    await run(PM_BIN, ['run', 'build'], webDir);

    // 4) Record history (previous version becomes the rollback target).
    await recordActivation(target, previous);
    log('history recorded');

    // 5) Restart the panel's own Node project via the aaPanel API (LAST).
    log(`restart project "${self.project}" via aaPanel`);
    await createClientForServer({
      baseUrl: self.baseUrl,
      apiSkEnc: self.apiSkEnc,
      insecureTLS: self.insecureTLS,
    }).batchOperation([self.project], 'restart');

    log(`=== ${kind} → v${target} (done) ===`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log(`FAILED: ${msg}`);
    process.exitCode = 1;
  } finally {
    releaseUpdateLock(paths.lock);
    await prisma.$disconnect().catch(() => undefined);
  }
}

void main();
