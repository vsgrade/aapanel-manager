import 'server-only';
import path from 'node:path';
import {mkdir, rm, rename} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {log} from '@/log';
import {setStagedVersion} from '@/lib/version/settings';
import type {DeployAdapter, PreflightResult, StageInput, StageResult, StageStep} from './adapter';
import {releaseLayout, sanitizeVersion, bundleAssetName} from './layout';
import {findBundleAssets, parseChecksumFile} from './bundle-assets';
import {downloadToFile, verifyFileChecksum, extractTarGz} from './bundle';
import {runDbBackup, isPgDumpAvailable, PgDumpNotAvailableError} from './db-backup';
import {runMigrations} from './migrate';

const execFileAsync = promisify(execFile);

/**
 * Self-update adapter for the "aaPanel Node project" deployment mode. Phase 2a:
 * download → verify → unpack → DB backup → migrate, all while the OLD code keeps
 * running. The atomic symlink swap + restart-via-aaPanel land in Phase 2b.
 */
export class AaPanelDeployAdapter implements DeployAdapter {
  readonly mode = 'aapanel' as const;

  constructor(private readonly releaseRoot: string | undefined) {}

  async preflight(): Promise<PreflightResult> {
    const issues: string[] = [];
    if (!this.releaseRoot) {
      issues.push('APP_RELEASE_ROOT is not set — self-update staging is disabled');
    } else {
      try {
        await mkdir(path.posix.join(this.releaseRoot.replace(/\\/g, '/'), 'releases'), {recursive: true});
      } catch (err) {
        issues.push(`Release root is not writable: ${err instanceof Error ? err.message : 'fs error'}`);
      }
    }
    if (!(await isTarAvailable())) {
      issues.push('`tar` is not available on this host');
    }
    const pgDumpAvailable = await isPgDumpAvailable();
    return {ok: issues.length === 0, issues, pgDumpAvailable};
  }

  async stage(input: StageInput): Promise<StageResult> {
    const steps: StageStep[] = [];
    const record = (name: string, ok: boolean, detail?: string): void => {
      steps.push({name, ok, detail});
    };
    let backupPath: string | null = null;
    const version = sanitizeVersion(input.release.version);

    try {
      const pre = await this.preflight();
      if (!pre.ok) {
        record('preflight', false, pre.issues.join('; '));
        return {ok: false, version, steps, message: pre.issues.join('; ')};
      }
      record('preflight', true);

      const root = this.releaseRoot!;
      const layout = releaseLayout(root, version);

      const assets = findBundleAssets(input.release, version);
      if (!assets) {
        const msg = `Release ${input.release.version} has no standalone bundle (${bundleAssetName(version)})`;
        record('locate-bundle', false, msg);
        return {ok: false, version, steps, message: msg};
      }
      record('locate-bundle', true, assets.bundle.name);

      // 1) Download the bundle to scratch space.
      const tarPath = path.posix.join(layout.tmpDir, bundleAssetName(version));
      await downloadToFile(assets.bundle.downloadUrl, tarPath, {token: input.githubToken});
      record('download', true, `${assets.bundle.size} bytes`);

      // 2) Verify integrity against the published checksum (when present).
      if (assets.checksum) {
        const expected = parseChecksumFile(await fetchText(assets.checksum.downloadUrl, input.githubToken));
        if (!expected) throw new Error('Published checksum file has no SHA-256 digest');
        await verifyFileChecksum(tarPath, expected);
        record('verify-checksum', true);
      } else {
        record('verify-checksum', true, 'no checksum published — integrity not verified');
      }

      // 3) Unpack atomically: extract to a temp dir, then swap it into place.
      const stagingDir = `${layout.releaseDir}.partial`;
      await rm(stagingDir, {recursive: true, force: true});
      await extractTarGz(tarPath, stagingDir);
      await rm(layout.releaseDir, {recursive: true, force: true});
      await mkdir(path.posix.dirname(layout.releaseDir), {recursive: true});
      await rename(stagingDir, layout.releaseDir);
      record('extract', true, layout.releaseDir);

      // 4) Back up the DB before any migration (rollback safety net).
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const out = path.posix.join(layout.backupsDir, `pre-${version}-${stamp}.sql`);
        const res = await runDbBackup(input.databaseUrl, out, layout.backupsDir);
        backupPath = res.path;
        record('db-backup', true, `${res.bytes} bytes`);
      } catch (err) {
        if (err instanceof PgDumpNotAvailableError && input.allowBackupSkip) {
          record('db-backup', true, 'skipped — pg_dump not installed (override)');
        } else if (err instanceof PgDumpNotAvailableError) {
          const msg = 'pg_dump is not installed — install it or confirm staging without a backup';
          record('db-backup', false, msg);
          return {ok: false, version, steps, backupPath, message: msg};
        } else {
          throw err;
        }
      }

      // 5) Apply migrations (expand/contract — safe with the old code running).
      const migrateOut = await runMigrations(layout.releaseDir, input.databaseUrl);
      record('migrate', true, migrateOut.split('\n').slice(-1)[0] || undefined);

      // 6) Mark the release as staged (ready for activation in Phase 2b).
      await setStagedVersion(version);
      record('record-staged', true, version);

      // Best-effort scratch cleanup.
      await rm(tarPath, {force: true}).catch(() => undefined);

      return {ok: true, version, steps, backupPath};
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Staging failed';
      log.error({err, version}, 'aapanel stage failed');
      record('error', false, message);
      return {ok: false, version, steps, backupPath, message};
    }
  }
}

async function isTarAvailable(): Promise<boolean> {
  try {
    await execFileAsync('tar', ['--version']);
    return true;
  } catch {
    return false;
  }
}

/** Fetches a small text resource (the checksum file) with optional auth. */
async function fetchText(url: string, token: string | null): Promise<string> {
  const headers: Record<string, string> = {'User-Agent': 'aapanel-manager', Accept: 'application/octet-stream'};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, {headers, redirect: 'follow'});
  if (!res.ok) throw new Error(`Failed to fetch checksum: HTTP ${res.status}`);
  return res.text();
}
