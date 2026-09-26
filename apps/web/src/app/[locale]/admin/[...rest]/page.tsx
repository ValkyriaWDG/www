import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { requireAdminPage } from '@/modules/auth/admin-guard';

export const dynamic = 'force-dynamic';

/**
 * Admin paths without a concrete page (yet): the admin guard runs first, so anonymous
 * visitors are sent to login with this exact path as `returnTo` and unauthorized actors
 * are denied; authorized actors get the localized 404. Concrete module pages
 * (`/admin/news`, …) take precedence over this catch-all.
 */
export default async function AdminFallbackPage({ params }: PageProps<'/[locale]/admin/[...rest]'>) {
  const { locale, rest } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const access = await requireAdminPage({ locale, path: `/admin/${rest.map((segment) => encodeURIComponent(segment)).join('/')}` });
  if (!access.ok) return access.denied;
  notFound();
}
