import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { bilingualAlternates } from '@/components/public/metadata';
import { ServersScreen } from '@/components/servers/servers-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';
import { gamePath } from '@/modules/games/routes';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/[game]/servers'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game)) return {};
  const [t, games] = await Promise.all([getTranslations({ locale, namespace: 'games.servers' }), getTranslations({ locale, namespace: 'games' })]);
  const selected = Boolean((await searchParams)?.server);
  return {
    title: games('sectionTitle', { section: t('title'), game: games(`names.${game}`) }),
    description: t('intro'),
    alternates: bilingualAlternates(locale, `${gamePath(game)}/servers`),
    // Selection is UI state, not a separate document; live values are not indexable facts.
    robots: selected ? { index: false, follow: true } : undefined,
  };
}

export default async function GameServersPage({ params, searchParams }: PageProps<'/[locale]/[game]/servers'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'servers')) notFound();
  setRequestLocale(locale);
  return <ServersScreen locale={locale} game={game} query={await searchParams} />;
}
