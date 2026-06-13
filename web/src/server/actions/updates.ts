'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin, AuthError} from '@/lib/auth/guards';
import {getCurrentVersion, type CurrentVersion} from '@/lib/version/current';
import {
  getUpdateSettings,
  saveUpdateSettings,
  getGithubConfig,
  getVersionHistory,
  recordVersionIfNew,
} from '@/lib/version/settings';
import {fetchReleases, pickLatestStable, GithubError, type GithubRelease} from '@/lib/version/github';
import {isNewer} from '@/lib/version/semver';
import {buildUpgradeCommand} from '@/lib/version/upgrade-command';
import {updateSettingsSchema} from '@/lib/validation/update-settings';
import {listServerOptions, type ServerOption} from '@/lib/servers/query';
import type {UpdateSettingsView} from '@/lib/version/types';
import {recordAudit} from '@/lib/audit';
import {log} from '@/log';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface LatestRelease {
  version: string;
  name: string;
  body: string;
  publishedAt: string | null;
  htmlUrl: string;
}

export type UpdateStatusResult =
  | {
      ok: true;
      current: CurrentVersion;
      configured: boolean;
      latest: LatestRelease | null;
      updateAvailable: boolean;
      releases: GithubRelease[];
      upgradeCommand: string;
      history: {version: string; installedAt: string}[];
      /** Non-fatal GitHub error (network/rate-limit/etc.); current version still shown. */
      error: string | null;
    }
  | {ok: false; message: string};

export type UpdateSettingsDataResult =
  | {ok: true; settings: UpdateSettingsView; servers: ServerOption[]}
  | {ok: false; message: string};

export type SaveSettingsResult =
  | {ok: true}
  | {ok: false; error: string; fieldErrors?: Record<string, string[]>};

function collectFieldErrors(issues: {path: PropertyKey[]; message: string}[]): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of issues) {
    const key = issue.path.join('.');
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return fieldErrors;
}

// ---------------------------------------------------------------------------
// Actions (admin only)
// ---------------------------------------------------------------------------

/** Current vs latest version + changelog + history. Requires admin role. */
export async function getUpdateStatusAction(): Promise<UpdateStatusResult> {
  try {
    await requireAdmin();
  } catch {
    return {ok: false, message: 'forbidden'};
  }

  const current = getCurrentVersion();
  // Best-effort history record — never block the status on it.
  try {
    await recordVersionIfNew(current.version);
  } catch (err) {
    log.warn({err}, 'recordVersionIfNew failed');
  }

  const settings = await getUpdateSettings();
  const upgradeCommand = buildUpgradeCommand(settings.deploymentMode, {serviceName: settings.serviceName});
  const history = (await getVersionHistory()).map((h) => ({
    version: h.version,
    installedAt: h.installedAt.toISOString(),
  }));
  const configured = Boolean(settings.githubOwner && settings.githubRepo);

  if (!configured) {
    return {ok: true, current, configured: false, latest: null, updateAvailable: false, releases: [], upgradeCommand, history, error: null};
  }

  try {
    const cfg = await getGithubConfig();
    const releases = await fetchReleases(cfg);
    const latestRel = pickLatestStable(releases);
    const latest: LatestRelease | null = latestRel
      ? {
          version: latestRel.version,
          name: latestRel.name,
          body: latestRel.body,
          publishedAt: latestRel.publishedAt,
          htmlUrl: latestRel.htmlUrl,
        }
      : null;
    const updateAvailable = latest ? isNewer(latest.version, current.version) : false;
    return {ok: true, current, configured: true, latest, updateAvailable, releases, upgradeCommand, history, error: null};
  } catch (err) {
    const message = err instanceof GithubError || err instanceof Error ? err.message : 'Update check failed';
    log.error({err}, 'getUpdateStatusAction GitHub check failed');
    return {ok: true, current, configured: true, latest: null, updateAvailable: false, releases: [], upgradeCommand, history, error: message};
  }
}

/** Loads settings + the server list (for the aaPanel-mode picker). Requires admin role. */
export async function getUpdateSettingsAction(): Promise<UpdateSettingsDataResult> {
  try {
    await requireAdmin();
  } catch {
    return {ok: false, message: 'forbidden'};
  }
  const [settings, servers] = await Promise.all([getUpdateSettings(), listServerOptions()]);
  return {ok: true, settings, servers};
}

/** Saves update settings. Requires admin role. Records audit on both paths. */
export async function saveUpdateSettingsAction(formData: FormData): Promise<SaveSettingsResult> {
  let userId: string;
  try {
    const user = await requireAdmin();
    userId = user.id;
  } catch (e) {
    return {ok: false, error: e instanceof AuthError ? e.code : 'forbidden'};
  }

  const parsed = updateSettingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {ok: false, error: 'validation', fieldErrors: collectFieldErrors(parsed.error.issues)};
  }

  try {
    await saveUpdateSettings(parsed.data);
    await recordAudit({userId, action: 'updates.settings', result: 'ok'});
    revalidatePath('/settings');
    return {ok: true};
  } catch (err) {
    log.error({err}, 'saveUpdateSettingsAction failed');
    await recordAudit({userId, action: 'updates.settings', result: 'error'});
    return {ok: false, error: err instanceof Error ? err.message : 'Failed to save settings'};
  }
}
