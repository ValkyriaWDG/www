import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HomeMenu } from '@/components/shell/home/home-menu';
import type { NextMatch } from '@/components/shell/home/next-match-strip';
import { getShellLinks } from '@/components/shell/shell-config';
import { routing } from '@/i18n/routing';
import { getDb } from '@/lib/db';
import { getServerEnv } from '@/lib/env';
import { getNextPublicMatch } from '@/modules/matches/queries';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'home.meta' });
  return { title: { absolute: t('title') }, description: t('description') };
}

/** Localized main menu (`/cs`, `/en`): reference-09 composition over the persistent scene. */
export default async function HomePage({ params }: PageProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [{ discordUrl }, nextMatch] = await Promise.all([getShellLinks(), loadNextMatch()]);
  return <HomeMenu discordUrl={discordUrl} nextMatch={nextMatch} />;
}

/** Earliest published upcoming fixture, or null (no strip) when none exists or data is unavailable. */
async function loadNextMatch(): Promise<NextMatch | null> {
  try {
    if (!getServerEnv().DATABASE_URL) return null;
    const next = await getNextPublicMatch(getDb());
    if (!next) return null;
    return {
      href: `/matches/${next.slug}`,
      opponent: next.opponentName,
      game: next.game,
      startsAt: next.startsAt,
      competition: next.competitionName,
    };
  } catch {
    return null;
  }
}
