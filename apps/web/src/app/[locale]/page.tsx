import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { HomeMenu } from '@/components/shell/home/home-menu';
import type { NextMatch } from '@/components/shell/home/next-match-strip';
import { getShellLinks } from '@/components/shell/shell-config';
import { routing } from '@/i18n/routing';

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
  const { discordUrl } = getShellLinks();
  // INTEGRATION: next published fixture from modules/matches
  const nextMatch: NextMatch | null = null;
  return <HomeMenu discordUrl={discordUrl} nextMatch={nextMatch} />;
}
