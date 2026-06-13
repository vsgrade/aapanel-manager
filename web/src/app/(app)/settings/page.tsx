import {redirect} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {requireUser} from '@/lib/auth/guards';
import {getUpdateStatusAction, getUpdateSettingsAction} from '@/server/actions/updates';
import {UpdateStatusCard} from '@/components/settings/update-status-card';
import {UpdateSettingsForm} from '@/components/settings/update-settings-form';

export default async function SettingsPage() {
  const user = await requireUser();
  if (user.role !== 'admin') redirect('/servers');

  const t = await getTranslations('updates');
  const [status, settingsData] = await Promise.all([getUpdateStatusAction(), getUpdateSettingsAction()]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>

      <UpdateStatusCard initial={status} />

      {settingsData.ok ? (
        <UpdateSettingsForm settings={settingsData.settings} servers={settingsData.servers} />
      ) : null}
    </div>
  );
}
