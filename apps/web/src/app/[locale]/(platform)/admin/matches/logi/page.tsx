import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LogiMatchPage } from '@/components/admin-community/logi-match-page';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };
export default async function ConnectedMatchesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: '/admin/matches/logi', capability: 'matches.edit' });
  if (!access.ok) return access.denied;
  return <LogiMatchPage actor={access.principal} />;
}
