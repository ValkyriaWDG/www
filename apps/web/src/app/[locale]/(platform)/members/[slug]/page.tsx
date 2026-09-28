import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { MemberProfileScreen, memberProfileMetadata } from '@/components/public/member-profile-screen';
import { routing } from '@/i18n/routing';

export const dynamicParams = true;

export async function generateMetadata({ params }: PageProps<'/[locale]/members/[slug]'>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  return memberProfileMetadata(locale, slug, null);
}

/** Canonical public member profile (one identity across game affiliations). */
export default async function MemberProfilePage({ params, searchParams }: PageProps<'/[locale]/members/[slug]'>) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return <MemberProfileScreen locale={locale} slug={slug} game={null} query={await searchParams} />;
}
