import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MembersListScreen, membersListMetadata } from '@/components/public/members-list-screen';
import { routing } from '@/i18n/routing';

export async function generateMetadata({ params, searchParams }: PageProps<'/[locale]/members'>): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return membersListMetadata(locale, await searchParams, null);
}

/** Shared community member directory (all affiliations, optional game filter). */
export default async function MembersPage({ params, searchParams }: PageProps<'/[locale]/members'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <MembersListScreen locale={locale} query={await searchParams} game={null} />;
}
