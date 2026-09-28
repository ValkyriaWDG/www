import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { manualListMetadata, ManualScreen } from '@/components/field-manual/manual-screen';
import { routing } from '@/i18n/routing';
import { gameHasSection, isGameRoute } from '@/modules/games/registry';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/[game]/field-manual'>): Promise<Metadata> {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'field-manual')) return {};
  return manualListMetadata(locale, game, await searchParams);
}

export default async function GameFieldManualPage({ params, searchParams }: PageProps<'/[locale]/[game]/field-manual'>) {
  const { locale, game } = await params;
  if (!hasLocale(routing.locales, locale) || !isGameRoute(game) || !gameHasSection(game, 'field-manual')) notFound();
  setRequestLocale(locale);
  return <ManualScreen locale={locale} game={game} query={await searchParams} />;
}
