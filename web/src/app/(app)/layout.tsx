import {redirect} from 'next/navigation';
import {auth} from '@/auth';
import {AppShell} from '@/components/app-shell';

export default async function AppLayout({children}: {children: React.ReactNode}) {
  if (!(await auth())) redirect('/login');
  return <AppShell>{children}</AppShell>;
}
