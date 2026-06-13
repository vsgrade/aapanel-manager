'use client';

import {useState, useTransition} from 'react';
import {useTranslations} from 'next-intl';
import {toast} from 'sonner';
import {RefreshCw, Copy, ExternalLink, ArrowUpCircle, CheckCircle2} from 'lucide-react';
import {getUpdateStatusAction, type UpdateStatusResult} from '@/server/actions/updates';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';

/** Deterministic timestamp (no locale/timezone) to avoid SSR/CSR hydration drift. */
function fmt(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

export function UpdateStatusCard({initial}: {initial: UpdateStatusResult}) {
  const t = useTranslations('updates');
  const [status, setStatus] = useState<UpdateStatusResult>(initial);
  const [pending, start] = useTransition();

  function refresh() {
    start(async () => {
      setStatus(await getUpdateStatusAction());
    });
  }

  if (!status.ok) {
    return (
      <Card>
        <CardContent className="py-4 text-sm text-destructive">{status.message}</CardContent>
      </Card>
    );
  }

  const s = status;

  function copyCommand() {
    void navigator.clipboard.writeText(s.upgradeCommand).then(
      () => toast.success(t('copied')),
      () => toast.error(t('copyFailed')),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('versionStatus')}</CardTitle>
        <CardDescription>{t('versionStatusHint')}</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm" disabled={pending} onClick={refresh}>
            <RefreshCw className={`mr-1 size-4 ${pending ? 'animate-spin' : ''}`} />
            {t('checkNow')}
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">{t('currentVersion')}</div>
            <div className="font-medium">
              {s.current.version}
              {s.current.commit ? <span className="text-muted-foreground"> ({s.current.commit})</span> : null}
            </div>
          </div>
          {s.configured && s.latest ? (
            <div>
              <div className="text-xs text-muted-foreground">{t('latestVersion')}</div>
              <div className="font-medium">{s.latest.version}</div>
            </div>
          ) : null}
          {s.configured && s.updateAvailable ? (
            <Badge className="border-0 bg-amber-500/15 text-amber-700 dark:text-amber-400">
              <ArrowUpCircle className="mr-1 size-3.5" />
              {t('updateAvailable')}
            </Badge>
          ) : s.configured && s.latest ? (
            <Badge variant="secondary" className="border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="mr-1 size-3.5" />
              {t('upToDate')}
            </Badge>
          ) : null}
        </div>

        {!s.configured ? <p className="text-sm text-muted-foreground">{t('notConfigured')}</p> : null}

        {s.error ? (
          <p className="text-sm text-destructive" role="alert">
            {t('checkFailed')}: {s.error}
          </p>
        ) : null}

        {s.latest && s.latest.body ? (
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">{t('changelog')}</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
              {s.latest.body}
            </pre>
            {s.latest.htmlUrl ? (
              <a
                href={s.latest.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="size-3.5" />
                {t('viewOnGithub')}
              </a>
            ) : null}
          </details>
        ) : null}

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{t('upgradeCommand')}</span>
            <Button variant="ghost" size="sm" onClick={copyCommand}>
              <Copy className="mr-1 size-3.5" />
              {t('copy')}
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">{s.upgradeCommand}</pre>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">{t('history')}</span>
          {s.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('noHistory')}</p>
          ) : (
            <ul className="text-sm">
              {s.history.map((h) => (
                <li key={h.installedAt} className="flex justify-between border-b py-1 last:border-0">
                  <span className="font-medium">{h.version}</span>
                  <span className="text-xs text-muted-foreground">{fmt(h.installedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
