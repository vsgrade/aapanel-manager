import type {DeploymentMode} from '@/lib/version/types';
import type {GithubRelease} from '@/lib/version/github';

/** Readiness of a deployment target for staging an update. */
export interface PreflightResult {
  /** True when staging can be attempted. */
  ok: boolean;
  /** Human-readable blockers (empty when ok). */
  issues: string[];
  /** Whether pg_dump is present — false means a backup needs explicit override. */
  pgDumpAvailable: boolean;
}

/** One step of the staging pipeline, for the audit/log trail and the UI. */
export interface StageStep {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface StageResult {
  ok: boolean;
  version: string;
  steps: StageStep[];
  /** Path of the pre-update DB dump, if one was taken. */
  backupPath?: string | null;
  /** Error summary when ok is false. */
  message?: string;
}

export interface StageInput {
  /** Target release (must carry assets — the bundle is downloaded from them). */
  release: GithubRelease;
  /** Live DB connection string (used for the pre-update dump + migrations). */
  databaseUrl: string;
  /** Token for private-repo asset downloads (null for public). */
  githubToken: string | null;
  /** Proceed even when a DB backup can't be taken (pg_dump missing). */
  allowBackupSkip?: boolean;
}

/**
 * A deployment adapter encapsulates how the panel updates itself for one
 * installation mode. Phase 2a implements detection + staging (download, verify,
 * backup, migrate) with no self-restart; activation/rollback land in Phase 2b.
 */
export interface DeployAdapter {
  readonly mode: DeploymentMode;
  /** Cheap environment-readiness check (no network, no release needed). */
  preflight(): Promise<PreflightResult>;
  /** Downloads + verifies + unpacks the release and applies migrations. */
  stage(input: StageInput): Promise<StageResult>;
}
