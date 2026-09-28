import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound, permanentRedirect } from 'next/navigation';
import { canonicalMatchRedirect } from '@/components/public/match-detail-screen';
import { routing } from '@/i18n/routing';

export const dynamicParams = true;

/**
 * Legacy shared match URL (`/cs/matches/<slug>`, the pre-platform Wardogs route): every
 * match belongs to exactly one game, so a published match permanently redirects to its
 * game section. Unknown and draft matches stay a 404.
 */
export default async function LegacyMatchDetailPage({ params }: PageProps<'/[locale]/matches/[slug]'>) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const target = await canonicalMatchRedirect(locale, slug);
  if (!target) notFound();
  permanentRedirect(target);
}
