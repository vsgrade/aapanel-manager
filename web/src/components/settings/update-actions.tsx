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
  /** Whether one-click staging is wired on this host (APP_RELEASE_ROOT + adapter). */
  stagingSupported: boolean;
  /** Whether the panel's own aaPanel self-restart target is configured. */
  selfRestartConfigured: boolean;
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
  'self-restart-not-configured': 'errSelfNotConfigured',
  'nothing-staged': 'errNothingStaged',
  'release-not-found': 'errReleaseNotFound',
};

export function UpdateActions(props: UpdateActionsProps) {
  const {
    stagingSupported,
    selfRestartConfigured,
    bundleAvailable,
    updateAvailable,
    latestVersion,
    stagedVersion,
    previousVersion,
    currentVersion,
    onChanged,
  } = props;
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

  // The primary action is contextual: apply a staged release, prepare an available
  // one, or otherwise a disabled "Update" with the reason it is unavailable.
  const canPrepare =
    stagingSupported && selfRestartConfigured && updateAvailable && bundleAvailable && Boolean(latestVersion);
  const primaryReason = !stagingSupported
    ? t('updateNeedsServer')
    : !selfRestartConfigured
      ? t('updateNeedsSelfConfig')
      : !updateAvailable
        ? t('updateUpToDate')
        : !bundleAvailable
          ? t('noBundle')
          : '';

  const canRollback = stagingSupported && selfRestartConfigured && Boolean(previousVersion);
  const rollbackReason = !previousVersion
    ? t('rollbackNoPrev')
    : !stagingSupported
      ? t('updateNeedsServer')
      : !selfRestartConfigured
        ? t('updateNeedsSelfConfig')
        : '';

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
        ) : canPrepare ? (
          <Button size="sm" disabled={busy} onClick={doStage}>
            {phase === 'staging' ? <Loader2 className="mr-1 size-4 animate-spin" /> : <Download className="mr-1 size-4" />}
            {t('prepareUpdate', {version: latestVersion ?? ''})}
          </Button>
        ) : (
          <Button size="sm" disabled title={primaryReason}>
            <ArrowUpCircle className="mr-1 size-4" />
            {t('updateLabel')}
          </Button>
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={busy || !canRollback}
          title={rollbackReason}
          onClick={() => previousVersion && setConfirm({kind: 'rollback', version: previousVersion})}
        >
          <RotateCcw className="mr-1 size-4" />
          {previousVersion ? t('rollbackTo', {version: previousVersion}) : t('rollbackLabel')}
        </Button>
      </div>

      {/* One muted line explaining the current state of the buttons above. */}
      {stagedVersion ? (
        <p className="text-xs text-muted-foreground">{t('stagedReady', {version: stagedVersion})}</p>
      ) : !canPrepare && primaryReason ? (
        <p className="text-xs text-muted-foreground">{primaryReason}</p>
      ) : null}

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
