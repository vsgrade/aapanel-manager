import 'server-only';
import {prisma} from '@/lib/db/prisma';
import {encryptSecret, decryptSecret} from '@/lib/crypto/secret-box';
import {getEncryptionKey} from '@/lib/config/secrets';
import {DEPLOYMENT_MODES, type DeploymentMode, type UpdateSettingsView} from './types';

const SINGLETON_ID = 'singleton';

function toMode(v: string): DeploymentMode {
  return (DEPLOYMENT_MODES as readonly string[]).includes(v) ? (v as DeploymentMode) : 'manual';
}

const DEFAULTS: UpdateSettingsView = {
  deploymentMode: 'manual',
  githubOwner: '',
  githubRepo: '',
  hasToken: false,
  aapanelServerId: null,
  aapanelProject: null,
  startScript: null,
  serviceName: null,
};

/** Reads the singleton settings (defaults when no row exists yet — no write). */
export async function getUpdateSettings(): Promise<UpdateSettingsView> {
  const row = await prisma.updateSettings.findUnique({where: {id: SINGLETON_ID}});
  if (!row) return {...DEFAULTS};
  return {
    deploymentMode: toMode(row.deploymentMode),
    githubOwner: row.githubOwner,
    githubRepo: row.githubRepo,
    hasToken: Boolean(row.githubTokenEnc),
    aapanelServerId: row.aapanelServerId,
    aapanelProject: row.aapanelProject,
    startScript: row.startScript,
    serviceName: row.serviceName,
  };
}

export interface SaveUpdateSettingsInput {
  deploymentMode: DeploymentMode;
  githubOwner: string;
  githubRepo: string;
  /** New token; blank/undefined keeps the existing one. */
  githubToken?: string;
  aapanelServerId?: string | null;
  aapanelProject?: string | null;
  startScript?: string | null;
  serviceName?: string | null;
}

/** Upserts the singleton settings. A blank token preserves the stored one. */
export async function saveUpdateSettings(input: SaveUpdateSettingsInput): Promise<void> {
  const data = {
    deploymentMode: input.deploymentMode,
    githubOwner: input.githubOwner,
    githubRepo: input.githubRepo,
    aapanelServerId: input.aapanelServerId ?? null,
    aapanelProject: input.aapanelProject ?? null,
    startScript: input.startScript ?? null,
    serviceName: input.serviceName ?? null,
  };

  const token = input.githubToken?.trim();
  const tokenData = token ? {githubTokenEnc: encryptSecret(token, getEncryptionKey())} : {};

  await prisma.updateSettings.upsert({
    where: {id: SINGLETON_ID},
    create: {id: SINGLETON_ID, ...data, ...tokenData},
    update: {...data, ...tokenData},
  });
}

/** Server-only: GitHub config with the decrypted token (for release checks). */
export async function getGithubConfig(): Promise<{owner: string; repo: string; token: string | null}> {
  const row = await prisma.updateSettings.findUnique({where: {id: SINGLETON_ID}});
  if (!row) return {owner: '', repo: '', token: null};
  let token: string | null = null;
  if (row.githubTokenEnc) {
    try {
      token = decryptSecret(row.githubTokenEnc, getEncryptionKey());
    } catch {
      token = null; // a stale/invalid ciphertext must not break the check
    }
  }
  return {owner: row.githubOwner, repo: row.githubRepo, token};
}

/** Appends the version to history if it differs from the most recent entry. */
export async function recordVersionIfNew(version: string): Promise<void> {
  const last = await prisma.versionHistory.findFirst({orderBy: {installedAt: 'desc'}});
  if (last?.version === version) return;
  await prisma.versionHistory.create({data: {version}});
}

export async function getVersionHistory(limit = 20): Promise<{version: string; installedAt: Date}[]> {
  return prisma.versionHistory.findMany({
    orderBy: {installedAt: 'desc'},
    take: limit,
    select: {version: true, installedAt: true},
  });
}
