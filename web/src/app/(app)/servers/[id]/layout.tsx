import Link from 'next/link';
import {notFound} from 'next/navigation';
import {getTranslations} from 'next-intl/server';
import {requireUser} from '@/lib/auth/guards';
import {getServerForDetail} from '@/lib/servers/detail';
import {SectionNav} from '@/components/servers/detail/section-nav';

export default async function ServerDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{id: string}>;
}) {
  const {id} = await params;
  const user = await requireUser();
  const server = await getServerForDetail(id);
  if (!server) notFound();
  const t = await getTranslations('detail');

  return (
    <div className="space-y-4">
      <div>
        <nav className="text-sm text-muted-foreground">
          <Link href="/servers" className="hover:underline">
            {t('backToServers')}
          </Link>
          <span className="px-1">/</span>
          <span className="text-foreground">{server.name}</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold">{server.name}</h1>
        <p className="text-sm text-muted-foreground">
          {server.tag ? `${server.tag} · ` : ''}
          {server.baseUrl}
        </p>
      </div>
      <div className="flex flex-col gap-4 md:flex-row">
        <aside className="md:w-48 shrink-0">
          <SectionNav id={id} isAdmin={user.role === 'admin'} />
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
