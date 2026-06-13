'use client';

import {useState, useTransition} from 'react';
import {useRouter} from 'next/navigation';
import {useTranslations} from 'next-intl';
import {toast} from 'sonner';
import {saveUpdateSettingsAction, type SaveSettingsResult} from '@/server/actions/updates';
import type {UpdateSettingsView, DeploymentMode} from '@/lib/version/types';
import type {ServerOption} from '@/lib/servers/query';
import {Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const INITIAL: SaveSettingsResult = {ok: false, error: ''};
const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring';

const MODE_KEYS: Record<DeploymentMode, string> = {
  docker: 'modeDocker',
  systemd: 'modeSystemd',
  aapanel: 'modeAapanel',
  manual: 'modeManual',
};

export interface UpdateSettingsFormProps {
  settings: UpdateSettingsView;
  servers: ServerOption[];
}

export function UpdateSettingsForm({settings, servers}: UpdateSettingsFormProps) {
  const t = useTranslations('updates');
  const router = useRouter();
  const [mode, setMode] = useState<DeploymentMode>(settings.deploymentMode);
  const [result, setResult] = useState<SaveSettingsResult>(INITIAL);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await saveUpdateSettingsAction(fd);
      setResult(res);
      if (res.ok) {
        toast.success(t('saved'));
        router.refresh(); // re-run the page so the status reflects the new repo
      } else if (res.error !== 'validation') {
        toast.error(res.error);
      }
    });
  }

  const fieldErr = (name: string): string | undefined =>
    !result.ok && result.fieldErrors ? result.fieldErrors[name]?.[0] : undefined;

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>{t('settingsTitle')}</CardTitle>
          <CardDescription>{t('settingsHint')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {!result.ok && result.error && result.error !== 'validation' ? (
            <p className="text-sm text-destructive" role="alert">
              {result.error}
            </p>
          ) : null}

          {/* Deployment mode */}
          <div className="space-y-1.5">
            <Label htmlFor="us-mode">{t('deploymentMode')}</Label>
            <select
              id="us-mode"
              name="deploymentMode"
              value={mode}
              onChange={(e) => setMode(e.target.value as DeploymentMode)}
              className={SELECT_CLASS}
            >
              {(Object.keys(MODE_KEYS) as DeploymentMode[]).map((m) => (
                <option key={m} value={m}>
                  {t(MODE_KEYS[m])}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t('deploymentModeHint')}</p>
          </div>

          {/* GitHub source */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="us-owner">{t('githubOwner')}</Label>
              <Input id="us-owner" name="githubOwner" defaultValue={settings.githubOwner} autoComplete="off" placeholder="acme" />
              {fieldErr('githubOwner') ? <p className="text-xs text-destructive">{fieldErr('githubOwner')}</p> : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="us-repo">{t('githubRepo')}</Label>
              <Input id="us-repo" name="githubRepo" defaultValue={settings.githubRepo} autoComplete="off" placeholder="aapanel-manager" />
              {fieldErr('githubRepo') ? <p className="text-xs text-destructive">{fieldErr('githubRepo')}</p> : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="us-token">{t('githubToken')}</Label>
            <Input
              id="us-token"
              name="githubToken"
              type="password"
              autoComplete="off"
              placeholder={settings.hasToken ? t('githubTokenKeep') : undefined}
            />
            <p className="text-xs text-muted-foreground">{t('githubTokenHint')}</p>
          </div>

          {/* aaPanel-mode fields */}
          {mode === 'aapanel' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="us-server">{t('aapanelServer')}</Label>
                <select
                  id="us-server"
                  name="aapanelServerId"
                  className={SELECT_CLASS}
                  defaultValue={settings.aapanelServerId ?? ''}
                >
                  <option value="">{t('selectServer')}</option>
                  {servers.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name}
                      {srv.tag ? ` · ${srv.tag}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="us-project">{t('aapanelProject')}</Label>
                <Input id="us-project" name="aapanelProject" defaultValue={settings.aapanelProject ?? ''} autoComplete="off" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="us-script">{t('startScript')}</Label>
                <Input id="us-script" name="startScript" defaultValue={settings.startScript ?? ''} autoComplete="off" placeholder="start" />
              </div>
            </div>
          ) : null}

          {/* docker / systemd service name */}
          {mode === 'docker' || mode === 'systemd' ? (
            <div className="space-y-1.5">
              <Label htmlFor="us-service">{t('serviceName')}</Label>
              <Input id="us-service" name="serviceName" defaultValue={settings.serviceName ?? ''} autoComplete="off" placeholder={mode === 'docker' ? 'app' : 'aapanel'} />
              <p className="text-xs text-muted-foreground">{t('serviceNameHint')}</p>
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="justify-end">
          <Button type="submit" disabled={pending}>
            {t('save')}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
