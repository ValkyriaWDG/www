import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MatchesScreen } from '@/components/public/matches-screen';
import { bilingualAlternates, OG_LOCALE } from '@/components/public/metadata';
import { sharingMetadata } from '@/modules/social/metadata';
import { hasMatchFilters, parseMatchFilters } from '@/components/public/query';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui/panels';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/matches'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const filters = parseMatchFilters(await searchParams);
  const t = await getTranslations({ locale, namespace: 'matches.meta' });
  const sharing = sharingMetadata(locale, 'matches', undefined, undefined, t('title'), t('description'));
  return {
    title: t('title'),
    description: t('description'),
    alternates: bilingualAlternates(locale, '/matches'),
    openGraph: { type: 'website', title: t('title'), description: t('description'), url: `/${locale}/matches`, locale: OG_LOCALE[locale], images: sharing.images },
    twitter: sharing.twitter,
    ...(hasMatchFilters(filters) ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Public match browser: Upcoming vs Results, game filter and search in the URL. */
export default async function MatchesPage({ params, searchParams }: PageProps<'/[locale]/matches'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const filters = parseMatchFilters(await searchParams);
  const t = await getTranslations({ locale, namespace: 'matches.list' });
  return (
    <PageMain width="full" labelledBy="matches-title">
      <PageHeader
        breadcrumbs={[{ href: '/', label: t('breadcrumbHome') }, { label: t('title') }]}
        eyebrow={t('eyebrow')}
        title={t('title')}
        titleId="matches-title"
        description={<p>{t('intro')}</p>}
      />
      <MatchesScreen locale={locale} filters={filters} mode="list" />
    </PageMain>
  );
}
