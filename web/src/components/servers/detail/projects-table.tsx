'use client';

import {useState, useTransition} from 'react';
import {useTranslations} from 'next-intl';
import {toast} from 'sonner';
import {FileText, Play, Square, RotateCcw, RefreshCw} from 'lucide-react';
import type {ProjectsResult} from '@/server/actions/projects';
import {listNodeProjectsAction, projectControlAction} from '@/server/actions/projects';
import type {ProjectOperation} from '@/lib/aapanel';
import {Button} from '@/components/ui/button';
import {Badge} from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {ProjectLogsDialog} from '@/components/servers/detail/project-logs-dialog';

export interface ProjectsTableProps {
  id: string;
  initial: ProjectsResult;
  isAdmin: boolean;
}

const OP_TOAST_KEY: Record<ProjectOperation, 'started' | 'stopped_msg' | 'restarted'> = {
  start: 'started',
  stop: 'stopped_msg',
  restart: 'restarted',
};

export function ProjectsTable({id, initial, isAdmin}: ProjectsTableProps) {
  const t = useTranslations('projects');
  const [result, setResult] = useState<ProjectsResult>(initial);
  const [pending, startTransition] = useTransition();

  function refetch() {
    startTransition(async () => {
      const res = await listNodeProjectsAction(id);
      setResult(res);
    });
  }

  function runOp(name: string, op: ProjectOperation) {
    startTransition(async () => {
      const res = await projectControlAction(id, name, op);
      if (res.ok) {
        toast.success(t(OP_TOAST_KEY[op]));
        const updated = await listNodeProjectsAction(id);
        setResult(updated);
      } else {
        toast.error(res.message);
      }
    });
  }

  const header = (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-base font-semibold">{t('title')}</h2>
      <Button variant="outline" size="sm" disabled={pending} onClick={refetch}>
        <RefreshCw className="mr-1" />
        {t('refresh')}
      </Button>
    </div>
  );

  if (!result.ok) {
    return (
      <div>
        {header}
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive" role="alert">
          <p className="font-medium">{t('loadFailed')}</p>
          <p className="mt-1 text-xs opacity-80">{result.message}</p>
        </div>
      </div>
    );
  }

  const projects = result.projects;

  if (projects.length === 0) {
    return (
      <div>
        {header}
        <p className="text-sm text-muted-foreground">{t('noProjects')}</p>
      </div>
    );
  }

  return (
    <div>
      {header}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('name')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>{t('port')}</TableHead>
            <TableHead>{t('cpu')}</TableHead>
            <TableHead>{t('mem')}</TableHead>
            <TableHead>{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => (
            <TableRow key={p.name}>
              <TableCell className="font-medium">{p.name}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    p.status === 'running'
                      ? 'default'
                      : p.status === 'stopped'
                      ? 'destructive'
                      : 'secondary'
                  }
                  className={
                    p.status === 'running'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-0'
                      : undefined
                  }
                >
                  {t(p.status)}
                </Badge>
              </TableCell>
              <TableCell>{p.port ?? '—'}</TableCell>
              <TableCell>{p.cpu == null ? '—' : `${p.cpu.toFixed(1)}%`}</TableCell>
              <TableCell>{p.mem == null ? '—' : `${Math.round(p.mem)} MB`}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <ProjectLogsDialog
                    id={id}
                    project={p.name}
                    trigger={
                      <Button variant="ghost" size="sm" title={t('logs')}>
                        <FileText />
                        <span className="sr-only">{t('logs')}</span>
                      </Button>
                    }
                  />
                  {isAdmin && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={t('start')}
                        disabled={pending || p.status === 'running'}
                        onClick={() => runOp(p.name, 'start')}
                      >
                        <Play />
                        <span className="sr-only">{t('start')}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={t('stop')}
                        disabled={pending || p.status === 'stopped'}
                        onClick={() => runOp(p.name, 'stop')}
                      >
                        <Square />
                        <span className="sr-only">{t('stop')}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={t('restart')}
                        disabled={pending}
                        onClick={() => runOp(p.name, 'restart')}
                      >
                        <RotateCcw />
                        <span className="sr-only">{t('restart')}</span>
                      </Button>
                    </>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
