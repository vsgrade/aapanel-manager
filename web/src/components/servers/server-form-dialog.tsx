'use client';
import {useActionState, useEffect, useState, useTransition} from 'react';
import {useTranslations} from 'next-intl';
import {toast} from 'sonner';
import type {ServerRow} from '@/lib/servers/query';
import {
  createServerAction,
  updateServerAction,
  testConnectionAction,
  type ActionState,
} from '@/server/actions/servers';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

const INITIAL: ActionState = {ok: false, error: ''};

export interface ServerFormDialogProps {
  mode: 'create' | 'edit';
  server?: ServerRow;
  trigger: React.ReactElement;
}

export function ServerFormDialog({mode, server, trigger}: ServerFormDialogProps) {
  const t = useTranslations('servers');
  const action = mode === 'create' ? createServerAction : updateServerAction;
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [open, setOpen] = useState(false);
  const [insecure, setInsecure] = useState(server?.insecureTLS ?? true);
  const [testing, startTest] = useTransition();

  useEffect(() => {
    if (state.ok) {
      toast.success(t(state.message ?? 'saved'));
      setOpen(false);
    }
  }, [state, t]);

  const fieldErr = (name: string): string | undefined =>
    !state.ok && state.fieldErrors ? state.fieldErrors[name]?.[0] : undefined;

  function runTest(form: HTMLFormElement | null) {
    if (!form) return;
    const fd = new FormData(form);
    startTest(async () => {
      const res = await testConnectionAction(fd);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? t('add') : t('edit')}</DialogTitle>
          <DialogDescription>{t('formHint')}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {mode === 'edit' && server ? <input type="hidden" name="id" value={server.id} /> : null}
          <input type="hidden" name="insecureTLS" value={insecure ? 'true' : 'false'} />

          {!state.ok && state.error && state.error !== 'validation' ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="sf-name">{t('name')}</Label>
            <Input id="sf-name" name="name" defaultValue={server?.name} required />
            {fieldErr('name') ? <p className="text-xs text-destructive">{fieldErr('name')}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-baseUrl">{t('baseUrl')}</Label>
            <Input id="sf-baseUrl" name="baseUrl" defaultValue={server?.baseUrl} placeholder="https://host:8888" required />
            {fieldErr('baseUrl') ? <p className="text-xs text-destructive">{fieldErr('baseUrl')}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-apiSk">{t('apiSk')}</Label>
            <Input
              id="sf-apiSk"
              name="apiSk"
              type="password"
              autoComplete="off"
              placeholder={mode === 'edit' ? t('apiSkKeep') : undefined}
              required={mode === 'create'}
            />
            {fieldErr('apiSk') ? <p className="text-xs text-destructive">{fieldErr('apiSk')}</p> : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sf-tag">{t('tag')}</Label>
            <Input id="sf-tag" name="tag" defaultValue={server?.tag ?? ''} />
          </div>

          <div className="flex items-center gap-2">
            <Switch id="sf-insecure" checked={insecure} onCheckedChange={setInsecure} />
            <Label htmlFor="sf-insecure">{t('insecureTLS')}</Label>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={testing}
              onClick={(e) => runTest((e.currentTarget as HTMLButtonElement).form)}
            >
              {testing ? t('testing') : t('test')}
            </Button>
            <Button type="submit" disabled={pending}>
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
