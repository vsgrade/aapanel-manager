'use client';

import {useState, useTransition} from 'react';
import {useTranslations} from 'next-intl';
import {RefreshCw} from 'lucide-react';
import {getProjectLogsAction} from '@/server/actions/projects';
import {Button} from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface ProjectLogsDialogProps {
  id: string;
  project: string;
  trigger: React.ReactElement;
}

export function ProjectLogsDialog({id, project, trigger}: ProjectLogsDialogProps) {
  const t = useTranslations('projects');
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function fetchLogs() {
    startTransition(async () => {
      const res = await getProjectLogsAction(id, project);
      if (res.ok) {
        setLogs(res.logs);
        setError(null);
      } else {
        setLogs(null);
        setError(res.message);
      }
    });
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      // Trigger fetch in the open-change callback — no setState-in-effect
      fetchLogs();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('logsTitle', {name: project})}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {pending && (
            <p className="text-xs text-muted-foreground animate-pulse">Loading…</p>
          )}
          {!pending && error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}
          {!pending && !error && logs !== null && (
            logs.trim() === '' ? (
              <p className="text-sm text-muted-foreground">{t('logsEmpty')}</p>
            ) : (
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs bg-muted rounded-md p-3">
                {logs}
              </pre>
            )
          )}
          <div className="flex justify-end pt-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={fetchLogs}
            >
              <RefreshCw className="mr-1" />
              {t('logsRefresh')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
