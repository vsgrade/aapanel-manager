import {describe, it, expect} from 'vitest';
import {updateSettingsSchema} from './update-settings';

describe('updateSettingsSchema', () => {
  it('parses a full valid input', () => {
    const parsed = updateSettingsSchema.parse({
      deploymentMode: 'docker',
      githubOwner: 'acme',
      githubRepo: 'panel',
      githubToken: 'ghp_xxx',
      serviceName: 'app',
    });
    expect(parsed.deploymentMode).toBe('docker');
    expect(parsed.githubOwner).toBe('acme');
    expect(parsed.githubToken).toBe('ghp_xxx');
    expect(parsed.serviceName).toBe('app');
    expect(parsed.aapanelServerId).toBeNull();
  });

  it('treats a blank token as undefined (keep existing)', () => {
    const parsed = updateSettingsSchema.parse({deploymentMode: 'manual', githubToken: '   '});
    expect(parsed.githubToken).toBeUndefined();
  });

  it('defaults missing owner/repo to empty strings', () => {
    const parsed = updateSettingsSchema.parse({deploymentMode: 'manual'});
    expect(parsed.githubOwner).toBe('');
    expect(parsed.githubRepo).toBe('');
  });

  it('rejects an unknown deployment mode', () => {
    expect(updateSettingsSchema.safeParse({deploymentMode: 'kubernetes'}).success).toBe(false);
  });

  it('rejects an owner with illegal characters', () => {
    expect(updateSettingsSchema.safeParse({deploymentMode: 'docker', githubOwner: 'a/b'}).success).toBe(false);
  });
});
