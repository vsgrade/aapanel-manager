import Link from 'next/link';
import {getTranslations} from 'next-intl/server';
import {signOut} from '@/auth';
import {Button} from '@/components/ui/button';

export async function AppShell({children}: {children: React.ReactNode}) {
  const t = await getTranslations('nav');
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-4 py-2">
        <nav className="flex items-center gap-4">
          <Link href="/servers" className="font-semibold">aaPanel Manager</Link>
          <Link href="/servers" className="text-sm text-muted-foreground">{t('servers')}</Link>
        </nav>
        <form action={async () => {'use server'; await signOut({redirectTo: '/login'});}}>
          <Button variant="ghost" size="sm" type="submit">{t('signOut')}</Button>
        </form>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
