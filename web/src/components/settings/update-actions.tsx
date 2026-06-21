'use client';

import {useState} from 'react';
import {useTranslations} from 'next-intl';
import {toast} from 'sonner';
import {ArrowUpCircle, Download, RotateCcw, Loader2} from 'lucide-react';
import {stageUpdateAction, activateUpdateAction, rollbackUpdateAction} from '@/server/actions/updates';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface UpdateActionsProps {
  bundleAvailable: boolean;
  updateAvailable: boolean;
  latestVersion: string | null;
  stagedVersion: string | null;
  previousVersion: string | null;
  currentVersion: string;
  /** Re-fetch status in the parent card after a change completes. */
  onChanged: () => void;
}

type Confirm = {kind: 'activate' | 'rollback'; version: string} | null;
type Phase = 'idle' | 'staging' | 'restarting';

const HEALTH_TIMEOUT_MS = 180_000;
const HEALTH_POLL_MS = 2_500;

/** Maps server action error codes to localized text (falls back to the raw message). */
const ERR_KEYS: Record<string, string> = {
  'unsupported-mode': 'errUnsupportedMode',
  'aapanel-not-configured': 'errAapanelNotConfigured',
  'server-not-found': 'errServerNotFound',
  'nothing-staged': 'errNothingStaged',
  'release-not-found': 'errReleaseNotFound',
};

export function UpdateActions(props: UpdateActionsProps) {
  const {bundleAvailable, updateAvailable, latestVersion, stagedVersion, previousVersion, currentVersion, onChanged} =
    props;
  const t = useTranslations('updates');
  const [phase, setPhase] = useState<Phase>('idle');
  const [confirm, setConfirm] = useState<Confirm>(null);
  const busy = phase !== 'idle';

  const errText = (code: string, message?: string): string => {
    const key = ERR_KEYS[code];
    return key ? t(key) : message || code;
  };

  /** Polls the public health probe until it reports the target version, or times out. */
  async function waitForVersion(target: string): Promise<boolean> {
    const deadline = Date.now() + HEALTH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
      try {
        const res = await fetch('/api/health', {cache: 'no-store'});
        if (res.ok) {
          const body = (await res.json()) as {version?: string};
          if (body.version === target) return true;
        }
      } catch {
        // The app is restarting — the connection drops; keep polling.
      }
    }
    return false;
  }

  function doStage(): void {
    if (!latestVersion || busy) return;
    setPhase('staging');
    void (async () => {
      try {
        const res = await stageUpdateAction(latestVersion);
        if (res.ok) {
          toast.success(t('prepared', {version: res.version}));
          onChanged();
        } else {
          toast.error(res.message || errText(res.error));
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
      } finally {
        setPhase('idle');
      }
    })();
  }

  function runRestartAction(kind: 'activate' | 'rollback', target: string): void {
    setConfirm(null);
    setPhase('restarting');
    void (async () => {
      let res: {ok: boolean; error?: string; message?: string} | undefined;
      try {
        res = kind === 'activate' ? await activateUpdateAction() : await rollbackUpdateAction(target);
      } catch {
        // The restart can drop this request's connection — treat as "in progress".
        res = undefined;
      }
      if (res && !res.ok) {
        toast.error(res.message || errText(res.error ?? 'error'));
        setPhase('idle');
        return;
      }
      // Action accepted (or connection dropped on restart) — wait for the new version.
      const ok = await waitForVersion(target);
      setPhase('idle');
      toast[ok ? 'success' : 'error'](ok ? t('updateApplied', {version: target}) : t('updateTimeout'));
      onChanged();
    })();
  }

  const showPrepare = !stagedVersion && updateAvailable && bundleAvailable && latestVersion;
  const showNoBundle = !stagedVersion && updateAvailable && !bundleAvailable;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div>
        <div className="text-sm font-medium">{t('autoUpdate')}</div>
        <p className="text-xs text-muted-foreground">{t('autoUpdateHint')}</p>
      </div>

      {phase === 'restarting' ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="size-4 animate-spin" />
          {t('applying')}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {stagedVersion ? (
          <Button size="sm" disabled={busy} onClick={() => setConfirm({kind: 'activate', version: stagedVersion})}>
            <ArrowUpCircle className="mr-1 size-4" />
            {t('applyUpdate', {version: stagedVersion})}
          </Button>
        ) : showPrepare ? (
          <Button size="sm" disabled={busy} onClick={doStage}>
            {phase === 'staging' ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Download className="mr-1 size-4" />
            )}
            {t('prepareUpdate', {version: latestVersion})}
          </Button>
        ) : null}

        {previousVersion ? (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setConfirm({kind: 'rollback', version: previousVersion})}
          >
            <RotateCcw className="mr-1 size-4" />
            {t('rollbackTo', {version: previousVersion})}
          </Button>
        ) : null}
      </div>

      {stagedVersion ? <p className="text-xs text-muted-foreground">{t('stagedReady', {version: stagedVersion})}</p> : null}
      {showNoBundle ? <p className="text-xs text-muted-foreground">{t('noBundle')}</p> : null}

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm?.kind === 'rollback' ? t('confirmRollbackTitle') : t('confirmApplyTitle')}</DialogTitle>
            <DialogDescription>
              {confirm?.kind === 'rollback'
                ? t('confirmRollbackBody', {version: confirm?.version ?? '', current: currentVersion})
                : t('confirmApplyBody', {version: confirm?.version ?? '', current: currentVersion})}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => confirm && runRestartAction(confirm.kind, confirm.version)}>{t('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
