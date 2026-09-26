import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { CommunityChoices, CommunityLinks, HllPanel, SignInExplainer } from '@/components/public/community-blocks';
import { CorePage } from '@/components/public/core-page';
import { corePageMetadata, loadCorePage } from '@/components/public/core-page-data';
import { getShellLinks } from '@/components/shell/shell-config';
import { routing } from '@/i18n/routing';
import { getSiteConfig } from '@/lib/site-config';

export async function generateMetadata({ params }: PageProps<'/[locale]/community'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return corePageMetadata(locale, 'community');
}

/**
 * Community: reference-11 choices (DISCORD / HOW TO JOIN), the Discord-vs-sign-in
 * explanation, the published community guide, approved community links and the HLL website.
 */
export default async function CommunityPage({ params }: PageProps<'/[locale]/community'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [page, links, config] = await Promise.all([loadCorePage(locale, 'community'), getShellLinks(), getSiteConfig()]);
  return (
    <CorePage
      locale={locale}
      pageKey="community"
      page={page}
      before={
        <>
          <CommunityChoices locale={locale} discordUrl={links.discordUrl} guideAnchor={page ? 'community-content' : 'community-title'} />
          <SignInExplainer locale={locale} />
        </>
      }
      after={
        <>
          <CommunityLinks locale={locale} links={config?.communityLinks ?? []} />
          <HllPanel locale={locale} url={links.hllUrl} archiveUrl={links.hllArchiveUrl} />
        </>
      }
    />
  );
}
