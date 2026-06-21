/** How the panel is installed — determines how it restarts/updates itself. */
export const DEPLOYMENT_MODES = ['docker', 'systemd', 'aapanel', 'manual'] as const;
export type DeploymentMode = (typeof DEPLOYMENT_MODES)[number];

/** Settings view returned to the client — never includes the raw GitHub token. */
export interface UpdateSettingsView {
  deploymentMode: DeploymentMode;
  githubOwner: string;
  githubRepo: string;
  /** Whether a private-repo token is stored (the token itself is never sent). */
  hasToken: boolean;
  aapanelServerId: string | null;
  aapanelProject: string | null;
  startScript: string | null;
  serviceName: string | null;
  /** Version downloaded + migrated and awaiting activation (Phase 2b), or null. */
  stagedVersion: string | null;
  /** ISO timestamp when the staged release was prepared, or null. */
  stagedAt: string | null;
  /** Version active before the last activation — the rollback target, or null. */
  previousVersion: string | null;
}
