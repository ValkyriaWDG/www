import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { ExternalLink } from '@/components/public/external-link';
import { MatchesScreen } from '@/components/public/matches-screen';
import { bilingualAlternates } from '@/components/public/metadata';
import { hasMatchFilters, parseMatchFilters } from '@/components/public/query';
import { getShellLinks } from '@/components/shell/shell-config';
import { PageMain } from '@/components/shell/page-main';
import { PageHeader } from '@/components/ui/panels';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/matches'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const filters = parseMatchFilters(await searchParams);
  const t = await getTranslations({ locale, namespace: 'matches.meta' });
  return {
    title: t('title'),
    description: t('description'),
    alternates: bilingualAlternates(locale, '/matches'),
    ...(hasMatchFilters(filters) ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Public match browser: Upcoming vs Results, game filter and search in the URL. */
export default async function MatchesPage({ params, searchParams }: PageProps<'/[locale]/matches'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const filters = parseMatchFilters(await searchParams);
  const [t, links, external] = await Promise.all([
    getTranslations({ locale, namespace: 'matches.list' }),
    getShellLinks(),
    getTranslations({ locale, namespace: 'common.external' }),
  ]);
  return (
    <PageMain width="full" labelledBy="matches-title">
      <PageHeader
        breadcrumbs={[{ href: '/', label: t('breadcrumbHome') }, { label: t('title') }]}
        eyebrow={t('eyebrow')}
        title={t('title')}
        titleId="matches-title"
        description={<p>{t('intro')}</p>}
        actions={
          links.hllArchiveUrl ? (
            <ExternalLink href={links.hllArchiveUrl} externalLabel={external('suffix')} variant="button" data-hll-archive="">
              {t('hllArchive')}
            </ExternalLink>
          ) : undefined
        }
      />
      <MatchesScreen locale={locale} filters={filters} mode="list" />
    </PageMain>
  );
}
