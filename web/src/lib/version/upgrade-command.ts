import type {DeploymentMode} from './types';

/**
 * Best-effort upgrade command shown to the admin for the configured deployment
 * mode (Phase 1 is read-only — the panel shows the command, it does not run it).
 * The actual one-click update lands in Phase 2 via deployment adapters.
 */
export function buildUpgradeCommand(
  mode: DeploymentMode,
  opts: {serviceName?: string | null} = {},
): string {
  const service = opts.serviceName?.trim() || '<service>';
  switch (mode) {
    case 'docker':
      return 'docker compose pull && docker compose up -d';
    case 'systemd':
      return `git pull && pnpm install && pnpm build && pnpm prisma migrate deploy && systemctl restart ${service}`;
    case 'aapanel':
      // Build on the server, then restart the Node project from the panel.
      return 'git pull && pnpm install && pnpm build && pnpm prisma migrate deploy';
    case 'manual':
    default:
      return 'docker compose pull && docker compose up -d';
  }
}
